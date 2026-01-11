import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMetaSignature } from "../_shared/webhook-signature.ts";
import { detectMetaSource, getMetaUserInfo } from "../_shared/message-router.ts";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MatchedTarget {
  workspaceId: string;
  accessToken: string;
  connectionId: string;
  source: "channel_connections" | "channel_integrations";
}

// Find ALL workspaces that have this channel connected
async function getMatchingTargets(supabase: any, source: any): Promise<MatchedTarget[]> {
  const targets: MatchedTarget[] = [];
  const channelId = source.channelId;
  const provider = source.provider;

  console.log(`[WEBHOOK-META] Looking for workspaces with ${provider} channel: ${channelId}`);

  // 1. Check NEW channel_connections + oauth_tokens system
  const { data: connections, error: connError } = await supabase
    .from("channel_connections")
    .select(`
      id,
      workspace_id,
      provider,
      provider_channel_id,
      oauth_tokens (
        access_token_encrypted
      )
    `)
    .eq("provider_channel_id", channelId)
    .eq("status", "connected");

  if (connError) {
    console.error("[WEBHOOK-META] Error fetching channel_connections:", connError);
  } else if (connections && connections.length > 0) {
    console.log(`[WEBHOOK-META] Found ${connections.length} channel_connections for ${channelId}`);
    for (const conn of connections) {
      if (conn.oauth_tokens && conn.oauth_tokens.length > 0) {
        const encryptedToken = conn.oauth_tokens[0].access_token_encrypted;
        try {
          const decryptedToken = await decryptToken(encryptedToken);
          targets.push({
            workspaceId: conn.workspace_id,
            accessToken: decryptedToken,
            connectionId: conn.id,
            source: "channel_connections",
          });
        } catch (e) {
          console.error(`[WEBHOOK-META] Token decryption failed for workspace ${conn.workspace_id}:`, e);
        }
      }
    }
  }

  // 2. Check LEGACY channel_integrations system
  const channelType = provider === "messenger" ? "facebook" : provider;
  const { data: integrations, error: intError } = await supabase
    .from("channel_integrations")
    .select("id, workspace_id, config, account_id")
    .eq("channel", channelType)
    .eq("is_connected", true);

  if (intError) {
    console.error("[WEBHOOK-META] Error fetching channel_integrations:", intError);
  } else if (integrations && integrations.length > 0) {
    console.log(`[WEBHOOK-META] Checking ${integrations.length} legacy integrations`);
    for (const integration of integrations) {
      // Match by account_id or config.page_id/instagram_user_id
      const config = integration.config || {};
      const matchesChannel =
        integration.account_id === channelId ||
        config.page_id === channelId ||
        config.instagram_user_id === channelId;

      if (matchesChannel) {
        // Avoid duplicates if already added from channel_connections
        const alreadyAdded = targets.some((t) => t.workspaceId === integration.workspace_id);
        if (!alreadyAdded) {
          const token = config.page_access_token || config.access_token;
          if (token) {
            targets.push({
              workspaceId: integration.workspace_id,
              accessToken: token,
              connectionId: integration.id,
              source: "channel_integrations",
            });
          }
        }
      }
    }
  }

  console.log(`[WEBHOOK-META] Total matched targets: ${targets.length}`);
  return targets;
}

// Process a message for a specific workspace
async function processMessageForWorkspace({
  supabase,
  payload,
  source,
  workspaceId,
  accessToken,
}: {
  supabase: any;
  payload: any;
  source: any;
  workspaceId: string;
  accessToken: string;
}) {
  console.log(`[WEBHOOK-META] Processing for workspace: ${workspaceId}`);

  // Workspace-scoped deduplication: eventId includes workspaceId
  const eventId = `${workspaceId}_${source.provider}_${source.messageId}`;

  // Check if we already processed this event for THIS workspace
  const { data: existingEvent } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("event_id", eventId)
    .eq("processed", true)
    .maybeSingle();

  if (existingEvent) {
    console.log(`[WEBHOOK-META] Event already processed for workspace ${workspaceId}: ${eventId}`);
    return;
  }

  // Log the event for this workspace
  await supabase.from("webhook_events").upsert(
    {
      event_id: eventId,
      provider: source.provider,
      provider_channel_id: source.channelId,
      raw_payload: payload,
      processed: false,
    },
    { onConflict: "event_id" }
  );

  // Fetch sender info with improved logging
  let senderName = source.senderId;
  let senderAvatar: string | undefined;
  console.log(`[WEBHOOK-META] Fetching user info for ${source.provider} user: ${source.senderId}`);
  
  try {
    const userInfo = await getMetaUserInfo(source.senderId, accessToken, source.provider);
    console.log(`[WEBHOOK-META] User info result:`, JSON.stringify(userInfo));
    if (userInfo) {
      senderName = userInfo.name || source.senderId;
      senderAvatar = userInfo.profilePic;
    }
  } catch (e) {
    console.error(`[WEBHOOK-META] Failed to fetch sender info:`, e);
  }
  
  console.log(`[WEBHOOK-META] Using sender name: "${senderName}", hasAvatar: ${!!senderAvatar}`);

  // Find or create conversation for THIS workspace
  const channelType = source.provider === "messenger" ? "facebook" : source.provider;

  // Look for existing conversation by customer_phone (sender_id) + channel + workspace
  const { data: existingConvo } = await supabase
    .from("conversations")
    .select("id, thread_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", channelType)
    .eq("customer_phone", source.senderId)
    .maybeSingle();

  let conversationId: string;

  if (existingConvo) {
    conversationId = existingConvo.id;
    // Update thread_id if changed
    if (existingConvo.thread_id !== source.conversationId) {
      await supabase
        .from("conversations")
        .update({ thread_id: source.conversationId, last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    } else {
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    }
    console.log(`[WEBHOOK-META] Found existing conversation: ${conversationId}`);
  } else {
    // Create new conversation
    const { data: newConvo, error: createError } = await supabase
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        channel: channelType,
        customer_name: senderName,
        customer_phone: source.senderId,
        customer_avatar: senderAvatar,
        thread_id: source.conversationId,
        status: "جديد",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createError) {
      console.error(`[WEBHOOK-META] Failed to create conversation:`, createError);
      return;
    }
    conversationId = newConvo.id;
    console.log(`[WEBHOOK-META] Created new conversation: ${conversationId}`);
  }

  // Check for duplicate message within THIS conversation (workspace-scoped)
  const { data: existingMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("message_id", source.messageId)
    .maybeSingle();

  if (existingMsg) {
    console.log(`[WEBHOOK-META] Message already exists in conversation: ${source.messageId}`);
    // Mark event as processed
    await supabase
      .from("webhook_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    return;
  }

  // Insert the message
  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    content: source.messageText || "[Media]",
    sender_type: "customer",
    message_id: source.messageId,
    is_read: false,
    is_old: false,
    reply_sent: false,
  });

  if (msgError) {
    console.error(`[WEBHOOK-META] Failed to insert message:`, msgError);
    return;
  }

  console.log(`[WEBHOOK-META] Saved message for workspace ${workspaceId}: ${source.messageId}`);

  // Mark webhook event as processed
  await supabase
    .from("webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("event_id", eventId);

  // Trigger AI auto-reply if enabled
  try {
    const { data: convo } = await supabase
      .from("conversations")
      .select("assigned_agent_id, agents!conversations_assigned_agent_id_fkey(is_ai)")
      .eq("id", conversationId)
      .maybeSingle();

    if (convo?.agents?.is_ai) {
      console.log(`[WEBHOOK-META] Triggering AI auto-reply for conversation ${conversationId}`);
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      await fetch(`${supabaseUrl}/functions/v1/auto-reply-messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ conversationId }),
      });
    }
  } catch (e) {
    console.error(`[WEBHOOK-META] Failed to trigger auto-reply:`, e);
  }
}

serve(async (req) => {
  // Handle webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "lovable_webhook_2024";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[WEBHOOK-META] Verification successful");
      return new Response(challenge, { status: 200 });
    }

    console.error("[WEBHOOK-META] Verification failed");
    return new Response("Forbidden", { status: 403 });
  }

  // Handle OPTIONS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook events (POST)
  if (req.method === "POST") {
    try {
      const rawBody = await req.text();
      const signature = req.headers.get("X-Hub-Signature-256");
      const appSecret = Deno.env.get("FACEBOOK_APP_SECRET") || Deno.env.get("META_APP_SECRET");

      if (appSecret && !verifyMetaSignature(rawBody, signature, appSecret)) {
        console.error("[WEBHOOK-META] Invalid signature");
        return new Response("Invalid signature", { status: 403 });
      }

      const payload = JSON.parse(rawBody);
      console.log("[WEBHOOK-META] Received:", payload.object);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const source = detectMetaSource(payload);
      if (!source) {
        console.log("[WEBHOOK-META] No message detected in payload");
        return new Response("OK", { status: 200 });
      }

      if (source.isEcho) {
        console.log("[WEBHOOK-META] Skipping echo message");
        return new Response("OK", { status: 200 });
      }

      console.log("[WEBHOOK-META] Detected:", source.provider, source.channelId, "from:", source.senderId);

      // MULTI-TENANT: Route to ALL matching workspaces
      const targets = await getMatchingTargets(supabase, source);

      if (targets.length === 0) {
        console.error("[WEBHOOK-META] No workspaces found for channel:", source.channelId);
        return new Response("OK", { status: 200 });
      }

      console.log(`[WEBHOOK-META] Routing event to ${targets.length} workspace(s)`);

      for (const target of targets) {
        await processMessageForWorkspace({
          supabase,
          payload,
          source,
          workspaceId: target.workspaceId,
          accessToken: target.accessToken,
        });
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("[WEBHOOK-META] Error:", error);
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
