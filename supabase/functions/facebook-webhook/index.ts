import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    console.log('[WEBHOOK] Verification request:', { mode, token, challenge });

    // Use single unified token for all channels
    if (mode === 'subscribe' && token === UNIFIED_VERIFY_TOKEN) {
      console.log('[WEBHOOK] Verification successful with unified token');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[WEBHOOK] Verification failed - token mismatch. Expected:', UNIFIED_VERIFY_TOKEN);
      return new Response('Forbidden', { status: 403 });
    }
  }

  // Handle incoming messages (POST request from Meta)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Determine if this is Facebook or Instagram based on the object type
      const objectType = body.object;
      const isInstagram = objectType === 'instagram';
      const channel = isInstagram ? 'instagram' : 'facebook';

      console.log('[WEBHOOK] Object type:', objectType, '- Channel:', channel);

      // Get ALL connected integrations from channel_integrations table (include workspace_id)
      const { data: legacyIntegrations } = await supabase
        .from('channel_integrations')
        .select('config, account_id, workspace_id')
        .eq('channel', channel)
        .eq('is_connected', true);

      const integrations = legacyIntegrations || [];

      if (integrations.length === 0) {
        console.log(`[WEBHOOK] No ${channel} integrations found in database`);
        return new Response('OK', { status: 200 });
      }

      // Log all available integrations for debugging
      console.log(`[WEBHOOK] Found ${integrations.length} ${channel} integrations:`, 
        integrations.map(i => ({ 
          account_id: i.account_id, 
          workspace_id: i.workspace_id,
          instagram_account_id: (i.config as any)?.instagram_account_id,
          page_id: (i.config as any)?.page_id 
        }))
      );

      // Process each entry
      for (const entry of body.entry || []) {
        // Get the recipient ID from the first messaging event to identify which integration to use
        const recipientId = entry.messaging?.[0]?.recipient?.id || entry.id;
        console.log('[WEBHOOK] Looking for integration matching recipient:', recipientId);

        // Find the matching integration based on page_id, instagram_account_id, or account_id
        let matchingIntegration = integrations.find(integration => {
          const config = integration.config as any;
          const accountId = integration.account_id;
          
          // For Instagram, check instagram_account_id first, then page_id and account_id
          if (isInstagram) {
            const match = config?.instagram_account_id === recipientId || 
                   config?.page_id === recipientId ||
                   accountId === recipientId;
            if (match) {
              console.log('[WEBHOOK] Instagram integration matched:', { 
                instagram_account_id: config?.instagram_account_id,
                page_id: config?.page_id, 
                account_id: accountId,
                recipientId 
              });
            }
            return match;
          }
          return config?.page_id === recipientId || accountId === recipientId;
        });

        // If no match found but we have integrations, use the first one (single account per channel model)
        if (!matchingIntegration && integrations.length > 0) {
          console.log('[WEBHOOK] No exact match found, using first available integration');
          matchingIntegration = integrations[0];
        }

        if (!matchingIntegration) {
          console.log('[WEBHOOK] No matching integration found for recipient:', recipientId);
          continue;
        }

        const config = matchingIntegration.config as any;
        const workspaceId = matchingIntegration.workspace_id;
        const myAccountId = isInstagram 
          ? (config?.instagram_account_id || matchingIntegration.account_id)
          : (config?.page_id || matchingIntegration.account_id);
        const accessToken = config?.page_access_token;

        console.log('[WEBHOOK] Using integration with account ID:', myAccountId, 'workspace:', workspaceId);

        if (!workspaceId) {
          console.log('[WEBHOOK] No workspace_id for integration, skipping');
          continue;
        }

        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const messageRecipientId = messaging.recipient?.id;
          const messageText = messaging.message?.text;
          const messageId = messaging.message?.mid;
          const timestamp = messaging.timestamp;

          console.log('[WEBHOOK] Message details:', {
            senderId,
            recipientId: messageRecipientId,
            myAccountId,
            messageText,
            messageId
          });

          // Skip if no message text or if sender is our account
          if (!messageText || senderId === myAccountId) {
            console.log('[WEBHOOK] Skipping - no text or self message');
            continue;
          }

          console.log('[WEBHOOK] Processing message from:', senderId);

          // Find or create conversation
          let conversationId: string;
          const threadId = isInstagram ? `ig_${senderId}_${messageRecipientId}` : `t_${senderId}_${messageRecipientId}`;

          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_phone', senderId)
            .eq('channel', channel)
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
            console.log('[WEBHOOK] Message saved successfully for', channel);

            // Trigger AI auto-reply if enabled
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