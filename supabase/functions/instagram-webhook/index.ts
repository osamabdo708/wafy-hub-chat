import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UNIFIED_VERIFY_TOKEN = "almared_unified_webhook_2024";

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // Webhook verification
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === UNIFIED_VERIFY_TOKEN) return new Response(challenge, { status: 200 });
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[INSTAGRAM-WEBHOOK] Payload:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Load all connected Instagram channels
      const { data: connections } = await supabase
        .from('channel_connections')
        .select('id, workspace_id, provider_channel_id, oauth_tokens(access_token_encrypted)')
        .eq('status', 'connected')
        .eq('provider', 'instagram');

      for (const entry of body.entry || []) {
        const recipientId = entry.messaging?.[0]?.recipient?.id || entry.id;
        const potentialIds = [recipientId, entry.id].filter(Boolean);

        let workspaceId: string | null = null;
        let myAccountId: string | null = null;
        let accessToken: string | null = null;

        // Match connection
        const matchingConnection = connections?.find(conn => potentialIds.includes(conn.provider_channel_id || ''));
        if (matchingConnection) {
          workspaceId = matchingConnection.workspace_id;
          myAccountId = matchingConnection.provider_channel_id;
          const tokenRecord = matchingConnection.oauth_tokens?.[0];
          if (tokenRecord?.access_token_encrypted) {
            try { accessToken = await decryptToken(tokenRecord.access_token_encrypted); } 
            catch (e) { console.log('[INSTAGRAM-WEBHOOK] Failed to decrypt token'); }
          }
        }

        if (!workspaceId || !myAccountId) continue;

        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value || value.messaging_product !== "instagram") continue;

          const msg = value.message;
          if (!msg) continue;

          const senderId = value.sender?.id;
          const timestamp = value.timestamp;
          let messageId = msg.mid;
          const messageText = msg.text;
          const attachmentUrl = msg.attachments?.[0]?.payload?.url;
          const threadType = msg.thread_type || "INBOX";
          const content = messageText || attachmentUrl || "[Media]";

          if (senderId === myAccountId) continue;

          // Fetch sender name
          let customerName = `Instagram User ${senderId?.slice(-8)}`;
          try {
            if (accessToken && senderId) {
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

          // Ensure unique conversation per senderId + username
          const threadId = `ig_${workspaceId}_${senderId}_${customerName.replace(/\s/g, "_")}`;

          // Check if conversation exists
          let { data: existingConv } = await supabase
            .from('conversations')
            .select('id, customer_name')
            .eq('thread_id', threadId)
            .maybeSingle();

          let conversationId: string;

          if (!existingConv) {
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
          } else {
            conversationId = existingConv.id;
            // Update customer_name if changed
            if (existingConv.customer_name !== customerName) {
              await supabase.from('conversations')
                .update({ customer_name: customerName })
                .eq('id', conversationId);
            }
            await supabase.from('conversations')
              .update({ last_message_at: new Date(timestamp).toISOString() })
              .eq('id', conversationId);
          }

          // Generate safe message ID if missing
          if (!messageId) messageId = `igmsg_${timestamp}_${senderId}`;

          // Check duplicate message
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

          // Optional: trigger AI auto-reply
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
