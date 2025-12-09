import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

      // 🔥 FIX: Get ALL integrations without workspace filter first
      const { data: allIntegrations } = await supabase
        .from('channel_integrations')
        .select('config, account_id, workspace_id, channel')
        .eq('is_connected', true);

      if (!allIntegrations || allIntegrations.length === 0) {
        console.log(`[WEBHOOK] No integrations found in database`);
        return new Response('OK', { status: 200 });
      }

      console.log(`[WEBHOOK] Found ${allIntegrations.length} total integrations`);

      for (const entry of body.entry || []) {
        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const recipientId = messaging.recipient?.id;
          const messageText = messaging.message?.text;
          const messageId = messaging.message?.mid;
          const timestamp = messaging.timestamp;

          console.log('[WEBHOOK] Message details:', {
            senderId,
            recipientId,
            messageText,
            messageId
          });

          if (!messageText || !recipientId) {
            console.log('[WEBHOOK] Skipping - no text or recipient');
            continue;
          }

          // 🔥 FIX: Find matching integration by checking account_id, page_id, and instagram_account_id
          let matchingIntegration = allIntegrations.find(integration => {
            const config = integration.config as any;
            const accountId = integration.account_id;
            
            // Check if this integration matches the recipient
            if (isInstagram) {
              return config?.instagram_account_id === recipientId || 
                     config?.page_id === recipientId ||
                     accountId === recipientId;
            } else {
              return config?.page_id === recipientId || 
                     accountId === recipientId;
            }
          });

          if (!matchingIntegration) {
            console.log('[WEBHOOK] ❌ No matching integration found for recipient:', recipientId);
            console.log('[WEBHOOK] Available integrations:', allIntegrations.map(i => ({
              account_id: i.account_id,
              page_id: (i.config as any)?.page_id,
              instagram_account_id: (i.config as any)?.instagram_account_id,
              channel: i.channel
            })));
            continue;
          }

          const config = matchingIntegration.config as any;
          const workspaceId = matchingIntegration.workspace_id;
          const myAccountId = isInstagram 
            ? (config?.instagram_account_id || matchingIntegration.account_id)
            : (config?.page_id || matchingIntegration.account_id);
          const accessToken = config?.page_access_token;

          console.log('[WEBHOOK] ✅ Matched integration:', {
            account_id: myAccountId,
            workspace: workspaceId,
            channel: matchingIntegration.channel
          });

          // 🔥 FIX: Ensure workspace_id exists
          if (!workspaceId) {
            console.log('[WEBHOOK] ❌ No workspace_id for integration, skipping');
            continue;
          }

          // Skip if sender is our account
          if (senderId === myAccountId) {
            console.log('[WEBHOOK] Skipping - self message');
            continue;
          }

          console.log('[WEBHOOK] Processing message from:', senderId);

          // Find or create conversation
          let conversationId: string;
          const threadId = isInstagram ? `ig_${senderId}_${recipientId}` : `t_${senderId}_${recipientId}`;

          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_phone', senderId)
            .eq('workspace_id', workspaceId)
            .eq('thread_id', threadId)
            .maybeSingle();

          if (existingConv) {
            conversationId = existingConv.id;
            await supabase
              .from('conversations')
              .update({ last_message_at: new Date(timestamp).toISOString() })
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
                workspace_id: workspaceId,
                customer_name: customerName,
                customer_phone: senderId,
                channel: matchingIntegration.channel,
                platform: `${channel}_${myAccountId}`,
                thread_id: threadId,
                status: 'جديد',
                ai_enabled: false,
                last_message_at: new Date(timestamp).toISOString()
              })
              .select('id')
              .single();

            if (convError) {
              console.error('[WEBHOOK] Error creating conversation:', convError);
              continue;
            }
            conversationId = newConv.id;
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
              content: messageText,
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
