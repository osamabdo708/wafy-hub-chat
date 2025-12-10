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

          if (!recipientId) {
            console.log('[WEBHOOK] Skipping - no recipient');
            continue;
          }

          // Match connection by provider_channel_id (page id for FB, ig account/page id for IG)
          let matchingWorkspaceId: string | null = null;
          let myAccountId: string | null = null;
          let accessToken: string | null = null;
          const potentialIds = [recipientId, entry.id].filter(Boolean);

          const matchingConnection = connections?.find((conn) =>
            potentialIds.includes(conn.provider_channel_id || '')
          );
          if (matchingConnection) {
            matchingWorkspaceId = matchingConnection.workspace_id;
            myAccountId = matchingConnection.provider_channel_id;

            const tokenRecord = matchingConnection.oauth_tokens?.[0];
            if (tokenRecord?.access_token_encrypted) {
              try {
                accessToken = await decryptToken(tokenRecord.access_token_encrypted);
              } catch (e) {
                console.log('[WEBHOOK] Failed to decrypt token, continuing without it');
              }
            }

            console.log('[WEBHOOK] ✅ Matched connection:', {
              account_id: myAccountId,
              workspace: matchingWorkspaceId,
              channel: matchingConnection.provider
            });
          } else {
            // Fallback to legacy channel_integrations if no connection found
            const { data: legacyIntegrations } = await supabase
              .from('channel_integrations')
              .select('config, account_id, workspace_id, channel')
              .eq('is_connected', true)
              .eq('channel', channel);

            const legacyMatch = legacyIntegrations?.find((integration) => {
              const cfg = integration.config as any;
              return potentialIds.some((id) =>
                cfg?.page_id === id ||
                cfg?.instagram_account_id === id ||
                integration.account_id === id
              );
            });

            if (!legacyMatch) {
              console.log('[WEBHOOK] ❌ No matching connection found for recipient:', recipientId);
              continue;
            }

            matchingWorkspaceId = legacyMatch.workspace_id;
            myAccountId = legacyMatch.account_id ||
              (legacyMatch.config as any)?.instagram_account_id ||
              (legacyMatch.config as any)?.page_id ||
              recipientId;
            accessToken = (legacyMatch.config as any)?.page_access_token || null;

            console.log('[WEBHOOK] ✅ Matched legacy integration:', {
              account_id: myAccountId,
              workspace: matchingWorkspaceId,
              channel: legacyMatch.channel
            });
          }

          if (!matchingWorkspaceId || !myAccountId) {
            console.log('[WEBHOOK] ❌ Missing workspace/account for recipient:', recipientId);
            continue;
          }

          // 🔥 FIX: Ensure workspace_id exists
          if (!matchingWorkspaceId) {
            console.log('[WEBHOOK] ❌ No workspace_id for integration, skipping');
            continue;
          }

          // Skip if sender is our account or missing message id
          if (senderId === myAccountId) {
            console.log('[WEBHOOK] Skipping - self message');
            continue;
          }
          if (!messageId) {
            console.log('[WEBHOOK] Skipping - no messageId');
            continue;
          }

          console.log('[WEBHOOK] Processing message from:', senderId);

          // Find or create conversation
          let conversationId: string;
          const threadId = isInstagram ? `ig_${senderId}_${recipientId}` : `t_${senderId}_${recipientId}`;

          // Try to find an existing conversation scoped to workspace
          let { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_phone', senderId)
            .eq('workspace_id', matchingWorkspaceId)
            .eq('thread_id', threadId)
            .eq('channel', channel)
            .maybeSingle();

          // Fallback: find by phone+channel without workspace, then backfill workspace/thread
          if (!existingConv) {
            const { data: convByPhone } = await supabase
              .from('conversations')
              .select('id, workspace_id, thread_id')
              .eq('customer_phone', senderId)
              .eq('channel', channel)
              .maybeSingle();
            if (convByPhone) {
              existingConv = convByPhone;
              await supabase
                .from('conversations')
                .update({ workspace_id: matchingWorkspaceId, thread_id: threadId })
                .eq('id', convByPhone.id);
            }
          }

          if (existingConv) {
            conversationId = existingConv.id;
            await supabase
              .from('conversations')
              .update({ last_message_at: new Date(timestamp).toISOString(), workspace_id: matchingWorkspaceId })
              .eq('id', conversationId);
            console.log('[WEBHOOK] Updated existing conversation:', conversationId);
          } else {
            // Get customer name
            let customerName = isInstagram
              ? `Instagram User ${senderId.slice(-8)}`
              : `Facebook User ${senderId.slice(-8)}`;

            try {
              if (accessToken) {
                const nameResponse = await fetch(
                  `https://graph.facebook.com/v19.0/${senderId}?fields=name,username&access_token=${accessToken}`
                );
                const nameData = await nameResponse.json();
                console.log('[WEBHOOK] User info:', JSON.stringify(nameData));
                if (isInstagram && nameData.username) {
                  customerName = `@${nameData.username}`;
                } else if (nameData.name) {
                  customerName = nameData.name;
                }
              }
            } catch (e) {
              console.log('[WEBHOOK] Could not fetch customer name:', e);
            }

            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                workspace_id: matchingWorkspaceId,
                customer_name: customerName,
                customer_phone: senderId,
                channel: channel,
                platform: `${channel}_${myAccountId}`,
                thread_id: threadId,
                status: 'جديد',
                ai_enabled: false,
                last_message_at: new Date(timestamp).toISOString()
              })
              .select('id')
              .single();

            if (convError) {
              // Handle duplicate key (customer_phone, channel) by reusing the existing conversation
              if ((convError as any).code === '23505') {
                const { data: dupConv } = await supabase
                  .from('conversations')
                  .select('id')
                  .eq('customer_phone', senderId)
                  .eq('channel', channel)
                  .maybeSingle();
                if (dupConv) {
                  conversationId = dupConv.id;
                  await supabase
                    .from('conversations')
                    .update({ workspace_id: matchingWorkspaceId, thread_id: threadId, last_message_at: new Date(timestamp).toISOString() })
                    .eq('id', dupConv.id);
                  console.log('[WEBHOOK] Reused existing conversation after duplicate key:', dupConv.id);
                } else {
                  console.error('[WEBHOOK] Error creating conversation (no dup conv found):', convError);
                  continue;
                }
              } else {
                console.error('[WEBHOOK] Error creating conversation:', convError);
                continue;
              }
            } else if (newConv) {
              conversationId = newConv.id;
            } else {
              console.error('[WEBHOOK] Error creating conversation: newConv is null');
              continue;
            }
            console.log('[WEBHOOK] Created new conversation:', conversationId);
          }

          // Check if message already exists
          const { data: existingMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('message_id', messageId)
            .maybeSingle();

          if (existingMsg) {
            console.log('[WEBHOOK] Message already exists, skipping');
            continue;
          }

          // Insert message
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
            console.error('[WEBHOOK] Error inserting message:', msgError);
          } else {
            console.log('[WEBHOOK] ✅ Message saved successfully for', channel);

            try {
              await supabase.functions.invoke('auto-reply-messages');
            } catch (e) {
              console.log('[WEBHOOK] Auto-reply trigger failed:', e);
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
