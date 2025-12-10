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

  // Webhook verification
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[INSTAGRAM-WEBHOOK] Verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token === UNIFIED_VERIFY_TOKEN) {
      console.log('[INSTAGRAM-WEBHOOK] Verification successful');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[INSTAGRAM-WEBHOOK] Verification failed - token mismatch');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // Handle incoming messages
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[INSTAGRAM-WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Load all connected Instagram channels
      const { data: connections, error: connError } = await supabase
        .from('channel_connections')
        .select('id, workspace_id, provider, provider_channel_id, provider_entity_name, oauth_tokens(access_token_encrypted)')
        .eq('status', 'connected')
        .eq('provider', 'instagram');

      if (connError) console.error('[INSTAGRAM-WEBHOOK] Error loading channel connections:', connError);

      for (const entry of body.entry || []) {
        const recipientId = entry.messaging?.[0]?.recipient?.id || entry.id;
        const potentialIds = [recipientId, entry.id].filter(Boolean);

        let workspaceId: string | null = null;
        let myAccountId: string | null = null;
        let accessToken: string | null = null;

        // Match connection
        const matchingConnection = connections?.find((conn) =>
          potentialIds.includes(conn.provider_channel_id || '')
        );

        if (matchingConnection) {
          workspaceId = matchingConnection.workspace_id;
          myAccountId = matchingConnection.provider_channel_id;

          const tokenRecord = matchingConnection.oauth_tokens?.[0];
          if (tokenRecord?.access_token_encrypted) {
            try { accessToken = await decryptToken(tokenRecord.access_token_encrypted); } 
            catch (e) { console.log('[INSTAGRAM-WEBHOOK] Failed to decrypt token'); }
          }
        } else {
          // Fallback to legacy integrations
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

          if (!legacyMatch) continue;

          workspaceId = legacyMatch.workspace_id;
          myAccountId = legacyMatch.account_id || (legacyMatch.config as any)?.instagram_account_id || recipientId || entry.id;
          accessToken = (legacyMatch.config as any)?.page_access_token || null;
        }

        if (!workspaceId || !myAccountId) continue;

        // Process all Instagram changes
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value || value.messaging_product !== "instagram") continue;

          const msg = value.message;
          if (!msg) continue;

          const senderId = value.sender?.id;
          const recipientId = value.recipient?.id;
          const timestamp = value.timestamp;
          const messageId = msg.mid;
          const messageText = msg.text;
          const attachmentUrl = msg.attachments?.[0]?.payload?.url;
          const threadType = msg.thread_type || "INBOX"; // INBOX / PENDING / etc.
          const content = messageText || attachmentUrl || "[Media]";

          // Skip self messages
          if (senderId === myAccountId || !messageId) continue;

          // Fetch sender name
          let customerName = `Instagram User ${senderId.slice(-8)}`;
          try {
            if (accessToken) {
              const nameResponse = await fetch(
                `https://graph.facebook.com/v19.0/${senderId}?fields=name,username&access_token=${accessToken}`
              );
              const nameData = await nameResponse.json();
              if (nameData.username) customerName = `@${nameData.username}`;
              else if (nameData.name) customerName = nameData.name;
            }
          } catch (e) {
            console.log('[INSTAGRAM-WEBHOOK] Could not fetch customer name:', e);
          }

          const threadId = `ig_${senderId}_${recipientId}`;

          // Check existing conversation
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_phone', senderId)
            .eq('channel', 'instagram')
            .eq('workspace_id', workspaceId)
            .eq('thread_id', threadId)
            .maybeSingle();

          let conversationId: string;

          if (existingConv) {
            conversationId = existingConv.id;
            const { error: updateError } = await supabase
              .from('conversations')
              .update({ last_message_at: new Date(timestamp).toISOString() })
              .eq('id', conversationId);
            if (updateError) console.error('[INSTAGRAM-WEBHOOK] Error updating conversation timestamp:', updateError);
          } else {
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
            conversationId = newConv!.id;
          }

          // Check if message already exists
          const { data: existingMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('message_id', messageId)
            .maybeSingle();

          if (existingMsg) continue;

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
              created_at: new Date(timestamp).toISOString(),
              sender_name: customerName,
              thread_type: threadType
            });

          if (msgError) console.error('[INSTAGRAM-WEBHOOK] Error inserting message:', msgError);
          else console.log('[INSTAGRAM-WEBHOOK] Message saved successfully:', messageId);

          // Trigger AI auto-reply if needed
          try {
            const { error: invokeError } = await supabase.functions.invoke('auto-reply-messages');
            if (invokeError) console.error('[INSTAGRAM-WEBHOOK] Auto-reply trigger failed:', invokeError);
          } catch (e) {
            console.log('[INSTAGRAM-WEBHOOK] Auto-reply trigger failed:', e);
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
