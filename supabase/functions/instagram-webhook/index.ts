import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Single unified verify token for all channels
const UNIFIED_VERIFY_TOKEN = "almared_unified_webhook_2024";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Handle webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[INSTAGRAM-WEBHOOK] Verification request:', { mode, token, challenge });

    // Use single unified token for all channels
    if (mode === 'subscribe' && token === UNIFIED_VERIFY_TOKEN) {
      console.log('[INSTAGRAM-WEBHOOK] Verification successful with unified token');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[INSTAGRAM-WEBHOOK] Verification failed - token mismatch. Expected:', UNIFIED_VERIFY_TOKEN);
      return new Response('Forbidden', { status: 403 });
    }
  }

  // Handle incoming messages (POST request from Meta)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[INSTAGRAM-WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Prefer new channel_connections (independent channel linking)
      const { data: connections, error: connError } = await supabase
        .from('channel_connections')
        .select('id, workspace_id, provider, provider_channel_id, provider_entity_name, oauth_tokens(access_token_encrypted)')
        .eq('status', 'connected')
        .eq('provider', 'instagram');

      if (connError) {
        console.error('[INSTAGRAM-WEBHOOK] Error loading channel connections:', connError);
      }

      // Process each entry
      for (const entry of body.entry || []) {
        // Resolve recipient/entry ids for matching (IG can send recipient or entry.id)
        const recipientId = entry.messaging?.[0]?.recipient?.id || entry.id;
        const potentialIds = [recipientId, entry.id].filter(Boolean);
        console.log('[INSTAGRAM-WEBHOOK] Looking for connection matching:', potentialIds);

        let workspaceId: string | null = null;
        let myAccountId: string | null = null;
        let accessToken: string | null = null;

        const matchingConnection = connections?.find((conn) =>
          potentialIds.includes(conn.provider_channel_id || '')
        );

        if (matchingConnection) {
          workspaceId = matchingConnection.workspace_id;
          myAccountId = matchingConnection.provider_channel_id;

          const tokenRecord = matchingConnection.oauth_tokens?.[0];
          if (tokenRecord?.access_token_encrypted) {
            try {
              accessToken = await decryptToken(tokenRecord.access_token_encrypted);
            } catch (e) {
              console.log('[INSTAGRAM-WEBHOOK] Failed to decrypt token, continuing without it');
            }
          }

          console.log('[INSTAGRAM-WEBHOOK] Using connection with account ID:', myAccountId, 'workspace:', workspaceId);
        } else {
          // Fallback to legacy channel_integrations if no connection found
          const { data: legacyIntegrations } = await supabase
            .from('channel_integrations')
            .select('config, account_id, workspace_id, channel')
            .eq('is_connected', true)
            .like('channel', 'instagram%');

          const legacyMatch = legacyIntegrations?.find((integration) => {
            const cfg = integration.config as any;
            return potentialIds.some((id) =>
              cfg?.instagram_account_id === id ||
              cfg?.page_id === id ||
              integration.account_id === id
            );
          });

          if (!legacyMatch) {
            console.log('[INSTAGRAM-WEBHOOK] No matching connection found for recipient:', potentialIds);
            continue;
          }

          workspaceId = legacyMatch.workspace_id;
          myAccountId = legacyMatch.account_id || (legacyMatch.config as any)?.instagram_account_id || recipientId || entry.id;
          accessToken = (legacyMatch.config as any)?.page_access_token || null;

          console.log('[INSTAGRAM-WEBHOOK] Using legacy integration with account ID:', myAccountId, 'workspace:', workspaceId);
        }

        if (!workspaceId || !myAccountId) {
          console.log('[INSTAGRAM-WEBHOOK] Missing workspace/account for recipient:', potentialIds);
          continue;
        }

        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const messageRecipientId = messaging.recipient?.id;
          const messageText = messaging.message?.text;
          const attachmentUrl = messaging.message?.attachments?.[0]?.payload?.url;
          const content = messageText || attachmentUrl || '[Media]';
          const messageId = messaging.message?.mid;
          const timestamp = messaging.timestamp;

          console.log('[INSTAGRAM-WEBHOOK] Message details:', {
            senderId,
            recipientId: messageRecipientId,
            myAccountId,
            messageText,
            messageId
          });

          // Skip if sender is our account or missing message id
          if (senderId === myAccountId) {
            console.log('[INSTAGRAM-WEBHOOK] Skipping - self message');
            continue;
          }
          if (!messageId) {
            console.log('[INSTAGRAM-WEBHOOK] Skipping - no messageId');
            continue;
          }

          console.log('[INSTAGRAM-WEBHOOK] Processing message from:', senderId);

          // Find or create conversation
          let conversationId: string;
          const threadId = `ig_${senderId}_${messageRecipientId}`;

          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_phone', senderId)
            .eq('channel', 'instagram')
            .eq('workspace_id', workspaceId)
            .eq('thread_id', threadId)
            .maybeSingle();

          // Fallback: by phone+channel without workspace, then backfill workspace/thread
          let conversationId: string;
          let convRecord = existingConv;
          if (!convRecord) {
            const { data: convByPhone } = await supabase
              .from('conversations')
              .select('id, workspace_id, thread_id')
              .eq('customer_phone', senderId)
              .eq('channel', 'instagram')
              .maybeSingle();
            if (convByPhone) {
              convRecord = convByPhone;
              await supabase
                .from('conversations')
                .update({ workspace_id: workspaceId, thread_id: threadId })
                .eq('id', convByPhone.id);
            }
          }

          if (convRecord) {
            conversationId = convRecord.id;
            await supabase
              .from('conversations')
              .update({ last_message_at: new Date(timestamp).toISOString(), workspace_id: workspaceId })
              .eq('id', conversationId);
            console.log('[INSTAGRAM-WEBHOOK] Updated existing conversation:', conversationId);
          } else {
            // Get customer name
            let customerName = `Instagram User ${senderId.slice(-8)}`;

            try {
              if (accessToken) {
                const nameResponse = await fetch(
                  `https://graph.facebook.com/v19.0/${senderId}?fields=name,username&access_token=${accessToken}`
                );
                const nameData = await nameResponse.json();
                console.log('[INSTAGRAM-WEBHOOK] User info:', JSON.stringify(nameData));
                if (nameData.username) {
                  customerName = `@${nameData.username}`;
                } else if (nameData.name) {
                  customerName = nameData.name;
                }
              }
            } catch (e) {
              console.log('[INSTAGRAM-WEBHOOK] Could not fetch customer name:', e);
            }

            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                workspace_id: workspaceId,
                customer_name: customerName,
                customer_phone: senderId,
                channel: 'instagram',
                platform: `instagram_${myAccountId}`,
                thread_id: threadId,
                status: 'جديد',
                ai_enabled: false,
                last_message_at: new Date(timestamp).toISOString()
              })
              .select('id')
              .single();

            if (convError) {
              if ((convError as any).code === '23505') {
                const { data: dupConv } = await supabase
                  .from('conversations')
                  .select('id')
                  .eq('customer_phone', senderId)
                  .eq('channel', 'instagram')
                  .maybeSingle();
                if (dupConv) {
                  conversationId = dupConv.id;
                  await supabase
                    .from('conversations')
                    .update({ workspace_id: workspaceId, thread_id: threadId, last_message_at: new Date(timestamp).toISOString() })
                    .eq('id', dupConv.id);
                  console.log('[INSTAGRAM-WEBHOOK] Reused existing conversation after duplicate key:', dupConv.id);
                } else {
                  console.error('[INSTAGRAM-WEBHOOK] Error creating conversation (no dup found):', convError);
                  continue;
                }
              } else {
                console.error('[INSTAGRAM-WEBHOOK] Error creating conversation:', convError);
                continue;
              }
            } else {
              conversationId = newConv!.id;
              console.log('[INSTAGRAM-WEBHOOK] Created new conversation:', conversationId);
            }
          }

          // Check if message already exists
          const { data: existingMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('message_id', messageId)
            .maybeSingle();

          if (existingMsg) {
            console.log('[INSTAGRAM-WEBHOOK] Message already exists, skipping');
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
            console.error('[INSTAGRAM-WEBHOOK] Error inserting message:', msgError);
          } else {
            console.log('[INSTAGRAM-WEBHOOK] Message saved successfully for instagram');

            // Trigger AI auto-reply if enabled
            try {
              await supabase.functions.invoke('auto-reply-messages');
            } catch (e) {
              console.log('[INSTAGRAM-WEBHOOK] Auto-reply trigger failed:', e);
            }
          }
        }
      }

      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('[INSTAGRAM-WEBHOOK] Error processing webhook:', error);
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
