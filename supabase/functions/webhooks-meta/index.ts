import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMetaSignature } from "../_shared/webhook-signature.ts";
import { detectMetaSource, getMetaUserInfo } from "../_shared/message-router.ts";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Use a unified verify token
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

      // Verify signature
      if (appSecret && !verifyMetaSignature(rawBody, signature, appSecret)) {
        console.error("[WEBHOOK-META] Invalid signature");
        return new Response("Invalid signature", { status: 403 });
      }

      const payload = JSON.parse(rawBody);
      console.log("[WEBHOOK-META] Received:", payload.object);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Detect source from payload
      const source = detectMetaSource(payload);
      if (!source) {
        console.log("[WEBHOOK-META] No message detected in payload");
        return new Response("OK", { status: 200 });
      }

      // Skip echo messages (messages we sent)
      if (source.isEcho) {
        console.log("[WEBHOOK-META] Skipping echo message");
        return new Response("OK", { status: 200 });
      }

      console.log("[WEBHOOK-META] Detected:", source.provider, source.channelId, "from:", source.senderId);

      // Store raw event for deduplication
      const eventId = `${source.provider}_${source.messageId}`;
      const { data: existingEvent } = await supabase
        .from("webhook_events")
        .select("id")
        .eq("event_id", eventId)
        .single();

      if (existingEvent) {
        console.log("[WEBHOOK-META] Duplicate event, skipping");
        return new Response("OK", { status: 200 });
      }

      await supabase.from("webhook_events").insert({
        provider: source.provider,
        event_id: eventId,
        provider_channel_id: source.channelId,
        raw_payload: payload
      });

      // Find channel connection
      const { data: connection } = await supabase
        .from("channel_connections")
        .select("*, oauth_tokens(*)")
        .eq("provider", source.provider)
        .eq("provider_channel_id", source.channelId)
        .eq("status", "connected")
        .single();

      // Also check legacy channel_integrations
      let accessToken: string | null = null;
      let workspaceId: string | null = connection?.workspace_id;

      if (connection?.oauth_tokens?.[0]) {
        try {
          accessToken = await decryptToken(connection.oauth_tokens[0].access_token_encrypted);
        } catch (e) {
          console.error("[WEBHOOK-META] Failed to decrypt token");
        }
      }

      // Fallback to legacy system
      if (!accessToken) {
        const { data: legacyIntegration } = await supabase
          .from("channel_integrations")
          .select("config")
          .eq("channel", source.provider)
          .eq("is_connected", true)
          .single();

        if (legacyIntegration?.config?.page_access_token) {
          accessToken = legacyIntegration.config.page_access_token;
        }

        // Get workspace for legacy system
        if (!workspaceId) {
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("id")
            .limit(1)
            .single();
          workspaceId = workspace?.id;
        }
      }

      if (!workspaceId) {
        console.error("[WEBHOOK-META] No workspace found for channel:", source.channelId);
        // Still mark as processed
        await supabase
          .from("webhook_events")
          .update({ processed: true, processing_error: "No workspace found" })
          .eq("event_id", eventId);
        return new Response("OK", { status: 200 });
      }

      // Get sender info if we have a token
      let senderName = source.senderName;
      if (!senderName && accessToken) {
        const userInfo = await getMetaUserInfo(source.senderId, accessToken, source.provider);
        senderName = userInfo?.name;
      }

      // Find or create conversation
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, ai_enabled")
        .eq("channel", source.provider)
        .eq("thread_id", source.conversationId)
        .single();

      let conversationId: string;
      let aiEnabled = false;

      if (existingConv) {
        conversationId = existingConv.id;
        aiEnabled = existingConv.ai_enabled || false;

        // Update last message time
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);
      } else {
        // Create new conversation
        const { data: newConv, error: convError } = await supabase
          .from("conversations")
          .insert({
            workspace_id: workspaceId,
            channel: source.provider,
            thread_id: source.conversationId,
            customer_name: senderName || source.senderId,
            customer_phone: source.provider === "whatsapp" ? source.senderId : null,
            platform: source.provider,
            status: "جديد",
            ai_enabled: false
          })
          .select()
          .single();

        if (convError) {
          console.error("[WEBHOOK-META] Failed to create conversation:", convError);
          await supabase
            .from("webhook_events")
            .update({ processed: true, processing_error: convError.message })
            .eq("event_id", eventId);
          return new Response("OK", { status: 200 });
        }

        conversationId = newConv.id;
      }

      // Check for duplicate message
      const { data: existingMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("message_id", source.messageId)
        .single();

      if (existingMsg) {
        console.log("[WEBHOOK-META] Duplicate message, skipping");
        await supabase
          .from("webhook_events")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("event_id", eventId);
        return new Response("OK", { status: 200 });
      }

      // Insert message
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          message_id: source.messageId,
          content: source.messageText,
          sender_type: "customer",
          sender_id: source.senderId,
          is_old: false,
          reply_sent: false,
          is_read: false
        });

      if (msgError) {
        console.error("[WEBHOOK-META] Failed to insert message:", msgError);
      }

      // Mark event as processed
      await supabase
        .from("webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("event_id", eventId);

      console.log("[WEBHOOK-META] ✅ Message saved to conversation:", conversationId);

      // Trigger AI if enabled
      if (aiEnabled) {
        try {
          await supabase.functions.invoke("auto-reply-messages", {
            body: { conversationId }
          });
        } catch (e) {
          console.error("[WEBHOOK-META] Failed to trigger AI:", e);
        }
      }

      return new Response("OK", { status: 200 });

    } catch (error) {
      console.error("[WEBHOOK-META] Error:", error);
      return new Response("OK", { status: 200 }); // Always return 200 to Meta
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
