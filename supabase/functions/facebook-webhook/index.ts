import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UNIFIED_VERIFY_TOKEN = "almared_unified_webhook_2024";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[WEBHOOK] Verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token === UNIFIED_VERIFY_TOKEN) {
      console.log('[WEBHOOK] Verification successful with unified token');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[WEBHOOK] Verification failed - token mismatch. Expected:', UNIFIED_VERIFY_TOKEN);
      return new Response('Forbidden', { status: 403 });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const objectType = body.object;
      const isInstagram = objectType === 'instagram';
      const channel = isInstagram ? 'instagram' : 'facebook';

      console.log('[WEBHOOK] Object type:', objectType, '- Channel:', channel);

      // Prefer the new channel_connections table (respond.io-style: independent channels)
      const { data: connections, error: connError } = await supabase
        .from('channel_connections')
        .select('id, workspace_id, provider, provider_channel_id, provider_entity_name, oauth_tokens(access_token_encrypted)')
        .eq('status', 'connected')
        .eq('provider', channel);

      if (connError) {
        console.error('[WEBHOOK] Error loading channel connections:', connError);
      }

      for (const entry of body.entry || []) {
        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const recipientId = messaging.recipient?.id;
          const messageText = messaging.message?.text;
          const attachmentUrl = messaging.message?.attachments?.[0]?.payload?.url;
          const content = messageText || attachmentUrl || '[Media]';
          const messageId = messaging.message?.mid;
          const timestamp = messaging.timestamp;

          console.log('[WEBHOOK] Message details:', {
            senderId,
            recipientId,
            messageText,
            messageId
          });

          if (!recipientId || !messageId) {
            console.log('[WEBHOOK] Skipping - no recipient or messageId');
            continue;
          }

          const potentialIds = [recipientId, entry.id].filter(Boolean);

          // 🔥 MULTI-TENANT FIX: Find ALL matching workspaces for this channel
          const allMatches: Array<{ workspaceId: string; accountId: string; accessToken: string | null }> = [];

          // 1. Check new channel_connections
          const matchingConnections = connections?.filter((conn) =>
            potentialIds.includes(conn.provider_channel_id || '')
          ) || [];

          for (const conn of matchingConnections) {
            let token: string | null = null;
            const tokenRecord = conn.oauth_tokens?.[0];
            if (tokenRecord?.access_token_encrypted) {
              try {
                token = await decryptToken(tokenRecord.access_token_encrypted);
              } catch (e) {
                console.log('[WEBHOOK] Failed to decrypt token for workspace', conn.workspace_id);
              }
            }
            allMatches.push({
              workspaceId: conn.workspace_id,
              accountId: conn.provider_channel_id!,
              accessToken: token
            });
          }

          // 2. Check legacy channel_integrations
          const { data: legacyIntegrations } = await supabase
            .from('channel_integrations')
            .select('config, account_id, workspace_id, channel')
            .eq('is_connected', true)
            .eq('channel', channel);

          for (const integration of legacyIntegrations || []) {
            const cfg = integration.config as any;
            const matchesChannel = potentialIds.some((id) =>
              cfg?.page_id === id ||
              cfg?.instagram_account_id === id ||
              integration.account_id === id
            );

            if (matchesChannel) {
              // Avoid duplicates if already added from channel_connections
              const alreadyAdded = allMatches.some((m) => m.workspaceId === integration.workspace_id);
              if (!alreadyAdded) {
                allMatches.push({
                  workspaceId: integration.workspace_id,
                  accountId: integration.account_id ||
                    cfg?.instagram_account_id ||
                    cfg?.page_id ||
                    recipientId,
                  accessToken: cfg?.page_access_token || cfg?.access_token || null
                });
              }
            }
          }

          if (allMatches.length === 0) {
            console.log('[WEBHOOK] ❌ No matching workspaces found for recipient:', recipientId);
            continue;
          }

          console.log(`[WEBHOOK] 🚀 Processing message for ${allMatches.length} workspace(s)`);

          // 🔥 PROCESS MESSAGE FOR EACH WORKSPACE
          for (const match of allMatches) {
            const { workspaceId, accountId, accessToken } = match;

            console.log(`[WEBHOOK] ✅ Processing for workspace: ${workspaceId}, account: ${accountId}`);

            // Skip if sender is our account
            if (senderId === accountId) {
              console.log('[WEBHOOK] Skipping self message for workspace', workspaceId);
              continue;
            }

            // Find or create conversation FOR THIS WORKSPACE
            let conversationId: string;
            const threadId = isInstagram ? `ig_${senderId}_${recipientId}` : `t_${senderId}_${recipientId}`;

            // Try to find existing conversation scoped to THIS workspace
            let { data: existingConv } = await supabase
              .from('conversations')
              .select('id')
              .eq('customer_phone', senderId)
              .eq('workspace_id', workspaceId)
              .eq('channel', channel)
              .maybeSingle();

            if (existingConv) {
              conversationId = existingConv.id;
              await supabase
                .from('conversations')
                .update({ 
                  last_message_at: new Date(timestamp).toISOString(),
                  thread_id: threadId 
                })
                .eq('id', conversationId);
              console.log(`[WEBHOOK] Updated existing conversation for workspace ${workspaceId}:`, conversationId);
            } else {
              // Get customer name from Meta API
              let customerName = senderId; // Fallback to sender ID
              let customerAvatar: string | undefined;

              try {
                if (accessToken) {
                  // Use correct fields based on platform
                  // Instagram supports: name, username, profile_pic
                  const fields = isInstagram 
                    ? 'name,username,profile_pic' 
                    : 'first_name,last_name,profile_pic';
                  
                  const nameResponse = await fetch(
                    `https://graph.facebook.com/v19.0/${senderId}?fields=${fields}&access_token=${accessToken}`
                  );
                  const nameData = await nameResponse.json();
                  console.log('[WEBHOOK] User info response:', JSON.stringify(nameData));
                  
                  if (isInstagram) {
                    // Prefer username for Instagram, format as @username
                    if (nameData.username) {
                      customerName = `@${nameData.username}`;
                    } else if (nameData.name) {
                      customerName = nameData.name;
                    }
                    customerAvatar = nameData.profile_pic;
                  } else {
                    // Facebook: combine first_name and last_name
                    const firstName = nameData.first_name || '';
                    const lastName = nameData.last_name || '';
                    customerName = `${firstName} ${lastName}`.trim() || nameData.name || senderId;
                    customerAvatar = nameData.profile_pic;
                  }
                }
              } catch (e) {
                console.log('[WEBHOOK] Could not fetch customer name:', e);
              }

              // Check workspace settings for default AI enabled
              let defaultAiEnabled = false;
              let aiAgentId: string | null = null;
              
              try {
                const { data: workspace } = await supabase
                  .from('workspaces')
                  .select('settings')
                  .eq('id', workspaceId)
                  .single();
                
                if (workspace?.settings) {
                  const settings = workspace.settings as { default_ai_enabled?: boolean };
                  defaultAiEnabled = settings.default_ai_enabled || false;
                }

                if (defaultAiEnabled) {
                  const { data: aiAgent } = await supabase
                    .from('agents')
                    .select('id')
                    .eq('workspace_id', workspaceId)
                    .eq('is_ai', true)
                    .limit(1)
                    .maybeSingle();
                  
                  if (aiAgent) {
                    aiAgentId = aiAgent.id;
                  }
                }
              } catch (e) {
                console.log('[WEBHOOK] Could not fetch workspace settings:', e);
              }

              const { data: newConv, error: convError } = await supabase
                .from('conversations')
                .insert({
                  workspace_id: workspaceId,
                  customer_name: customerName,
                  customer_phone: senderId,
                  customer_avatar: customerAvatar,
                  channel: channel,
                  platform: `${channel}_${accountId}`,
                  thread_id: threadId,
                  status: 'جديد',
                  ai_enabled: defaultAiEnabled,
                  assigned_agent_id: aiAgentId,
                  last_message_at: new Date(timestamp).toISOString()
                })
                .select('id')
                .single();

              if (convError) {
                console.error(`[WEBHOOK] Error creating conversation for workspace ${workspaceId}:`, convError);
                continue;
              }
              conversationId = newConv.id;
              console.log(`[WEBHOOK] Created new conversation for workspace ${workspaceId}:`, conversationId);
            }

            // Check if message already exists IN THIS CONVERSATION (workspace-scoped)
            const { data: existingMsg } = await supabase
              .from('messages')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('message_id', messageId)
              .maybeSingle();

            if (existingMsg) {
              console.log(`[WEBHOOK] Message already exists in workspace ${workspaceId}, skipping`);
              continue;
            }

            // Insert message FOR THIS WORKSPACE
            const { error: msgError } = await supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                content,
                sender_type: 'customer',
                message_id: messageId,
                is_old: false,
                reply_sent: false,
                is_read: false,
                created_at: new Date(timestamp).toISOString()
              });

            if (msgError) {
              console.error(`[WEBHOOK] Error inserting message for workspace ${workspaceId}:`, msgError);
            } else {
              console.log(`[WEBHOOK] ✅ Message saved for workspace ${workspaceId}:`, messageId);

              try {
                await supabase.functions.invoke('auto-reply-messages');
              } catch (e) {
                console.log('[WEBHOOK] Auto-reply trigger failed:', e);
              }
            }
          }
        }
      }

      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('[WEBHOOK] Error processing webhook:', error);
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
