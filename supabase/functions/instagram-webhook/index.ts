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
        // Get the recipient ID from the first messaging event to identify which connection to use
        const recipientId = entry.messaging?.[0]?.recipient?.id || entry.id;
        console.log('[INSTAGRAM-WEBHOOK] Looking for connection matching recipient:', recipientId);

        const matchingConnection = connections?.find((conn) => conn.provider_channel_id === recipientId);

        if (!matchingConnection) {
          console.log('[INSTAGRAM-WEBHOOK] No matching connection found for recipient:', recipientId);
          continue;
        }

        const workspaceId = matchingConnection.workspace_id;
        const myAccountId = matchingConnection.provider_channel_id;

        let accessToken: string | null = null;
        const tokenRecord = matchingConnection.oauth_tokens?.[0];
        if (tokenRecord?.access_token_encrypted) {
          try {
            accessToken = await decryptToken(tokenRecord.access_token_encrypted);
          } catch (e) {
            console.log('[INSTAGRAM-WEBHOOK] Failed to decrypt token, continuing without it');
          }
        }

        console.log('[INSTAGRAM-WEBHOOK] Using connection with account ID:', myAccountId, 'workspace:', workspaceId);

        if (!workspaceId) {
          console.log('[INSTAGRAM-WEBHOOK] No workspace_id for integration, skipping');
          continue;
        }

        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const messageRecipientId = messaging.recipient?.id;
          const messageText = messaging.message?.text;
          const messageId = messaging.message?.mid;
          const timestamp = messaging.timestamp;

          console.log('[INSTAGRAM-WEBHOOK] Message details:', {
            senderId,
            recipientId: messageRecipientId,
            myAccountId,
            messageText,
            messageId
          });

          // Skip if no message text or if sender is our account
          if (!messageText || senderId === myAccountId) {
            console.log('[INSTAGRAM-WEBHOOK] Skipping - no text or self message');
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

          if (existingConv) {
            conversationId = existingConv.id;
            await supabase
              .from('conversations')
              .update({ last_message_at: new Date(timestamp).toISOString() })
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
              console.error('[INSTAGRAM-WEBHOOK] Error creating conversation:', convError);
              continue;
            }
            conversationId = newConv.id;
            console.log('[INSTAGRAM-WEBHOOK] Created new conversation:', conversationId);
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
              content: messageText,
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
