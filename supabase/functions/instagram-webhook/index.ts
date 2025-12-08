import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all connected Instagram integrations
    const { data: integrations } = await supabase
      .from('channel_integrations')
      .select('config')
      .eq('channel', 'instagram')
      .eq('is_connected', true);

    // Check if token matches any of the integrations
    const validToken = integrations?.some(integration => {
      const verifyToken = (integration?.config as any)?.verify_token;
      return verifyToken && token === verifyToken;
    }) || token === 'almared_instagram_webhook';

    if (mode === 'subscribe' && validToken) {
      console.log('[INSTAGRAM-WEBHOOK] Verification successful');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[INSTAGRAM-WEBHOOK] Verification failed');
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

      // Get ALL connected Instagram integrations
      const { data: integrations } = await supabase
        .from('channel_integrations')
        .select('config, account_id')
        .eq('channel', 'instagram')
        .eq('is_connected', true);

      if (!integrations || integrations.length === 0) {
        console.log('[INSTAGRAM-WEBHOOK] No Instagram integrations found');
        return new Response('OK', { status: 200 });
      }

      console.log(`[INSTAGRAM-WEBHOOK] Found ${integrations.length} Instagram integrations`);

      for (const entry of body.entry || []) {
        // Get the recipient ID from the first messaging event
        const recipientId = entry.messaging?.[0]?.recipient?.id || entry.id;
        console.log('[INSTAGRAM-WEBHOOK] Looking for integration matching recipient:', recipientId);

        // Find the matching integration
        const matchingIntegration = integrations.find(integration => {
          const config = integration.config as any;
          return config?.instagram_account_id === recipientId || config?.page_id === recipientId;
        });

        if (!matchingIntegration) {
          console.log('[INSTAGRAM-WEBHOOK] No matching integration found for recipient:', recipientId);
          continue;
        }

        const config = matchingIntegration.config as any;
        const myInstagramId = config.instagram_account_id;

        console.log('[INSTAGRAM-WEBHOOK] Using integration with Instagram ID:', myInstagramId);

        // Handle Instagram messaging events
        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const messageRecipientId = messaging.recipient?.id;
          const messageText = messaging.message?.text;
          const messageId = messaging.message?.mid;
          const timestamp = messaging.timestamp;

          console.log('[INSTAGRAM-WEBHOOK] Message details:', { senderId, recipientId: messageRecipientId, myInstagramId, messageText });

          // Skip if no text or if message is from our account
          if (!messageText || senderId === myInstagramId) {
            console.log('[INSTAGRAM-WEBHOOK] Skipping message - no text or from self');
            continue;
          }

          console.log('[INSTAGRAM-WEBHOOK] Processing incoming message:', { senderId, messageText, messageId });

          let conversationId: string;
          const threadId = `ig_${senderId}_${messageRecipientId}`;

          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_phone', senderId)
            .eq('channel', 'instagram')
            .eq('thread_id', threadId)
            .maybeSingle();

          if (existingConv) {
            conversationId = existingConv.id;
            await supabase
              .from('conversations')
              .update({ 
                last_message_at: new Date(timestamp).toISOString()
              })
              .eq('id', conversationId);
            console.log('[INSTAGRAM-WEBHOOK] Updated existing conversation:', conversationId);
          } else {
            let customerName = `Instagram User ${senderId.slice(-8)}`;

            // Try to get user info from Instagram API
            if (config.page_access_token) {
              try {
                const userInfoRes = await fetch(
                  `https://graph.facebook.com/v19.0/${senderId}?fields=name,username&access_token=${config.page_access_token}`
                );
                const userInfo = await userInfoRes.json();
                console.log('[INSTAGRAM-WEBHOOK] User info:', JSON.stringify(userInfo));
                if (userInfo.username) {
                  customerName = `@${userInfo.username}`;
                } else if (userInfo.name) {
                  customerName = userInfo.name;
                }
              } catch (e) {
                console.log('[INSTAGRAM-WEBHOOK] Could not fetch user info:', e);
              }
            }

            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                customer_name: customerName,
                customer_phone: senderId,
                channel: 'instagram',
                platform: `instagram_${myInstagramId}`, // Include account ID for differentiation
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

          // Check for duplicate message
          const { data: existingMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('message_id', messageId)
            .maybeSingle();

          if (existingMsg) {
            console.log('[INSTAGRAM-WEBHOOK] Message already exists, skipping');
            continue;
          }

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
            console.log('[INSTAGRAM-WEBHOOK] Message saved successfully');
            // Trigger auto-reply if enabled
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
