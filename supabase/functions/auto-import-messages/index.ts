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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[AUTO-IMPORT] Starting automated message import...');

    let totalImported = 0;

    // Determine if this is initial import (no messages exist yet)
    const { data: existingMessages } = await supabase
      .from('messages')
      .select('id')
      .limit(1);
    
    const isInitialImport = !existingMessages || existingMessages.length === 0;

    // Import Facebook Messages
    const { data: fbIntegration } = await supabase
      .from('channel_integrations')
      .select('config, last_fetch_timestamp')
      .eq('channel', 'facebook')
      .eq('is_connected', true)
      .single();

    if (fbIntegration?.config) {
      const config = fbIntegration.config as any;
      const { page_id, page_access_token } = config;

      if (page_id && page_access_token) {
        console.log('[FACEBOOK] Fetching conversations...');
        
        // Calculate since timestamp (last fetch or 24 hours ago for initial)
        let sinceTimestamp = fbIntegration.last_fetch_timestamp 
          ? new Date(fbIntegration.last_fetch_timestamp).getTime() / 1000
          : (Date.now() - 24 * 60 * 60 * 1000) / 1000;

        let conversationsUrl = `https://graph.facebook.com/v18.0/${page_id}/conversations?fields=id,senders,messages{id,message,from,created_time}&since=${sinceTimestamp}&access_token=${page_access_token}`;
        
        // Paginate through all conversations
        while (conversationsUrl) {
          const conversationsResponse = await fetch(conversationsUrl);
          const conversationsData = await conversationsResponse.json();

          if (conversationsData.data) {
            for (const fbConv of conversationsData.data) {
              const threadId = fbConv.id;
              const senderId = fbConv.senders?.data[0]?.id || 'unknown';
              const messages = fbConv.messages?.data || [];
              
              if (messages.length === 0) continue;

              // Get or create conversation using thread_id
              const { data: existingConv } = await supabase
                .from('conversations')
                .select('id, ai_enabled')
                .eq('thread_id', threadId)
                .eq('platform', 'facebook')
                .maybeSingle();

              let conversationId;
              if (existingConv) {
                conversationId = existingConv.id;
                await supabase
                  .from('conversations')
                  .update({ last_message_at: messages[0].created_time })
                  .eq('id', conversationId);
              } else {
                const userUrl = `https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${page_access_token}`;
                const userResponse = await fetch(userUrl);
                const userData = await userResponse.json();
                const customerName = userData.name || `Facebook User ${senderId.substring(0, 8)}`;

                const { data: newConv } = await supabase
                  .from('conversations')
                  .insert({
                    customer_name: customerName,
                    customer_phone: senderId,
                    channel: 'facebook',
                    platform: 'facebook',
                    thread_id: threadId,
                    status: 'جديد',
                    ai_enabled: false, // Initial import: AI disabled by default
                    last_message_at: messages[0].created_time
                  })
                  .select()
                  .single();

                conversationId = newConv.id;
              }

              // Import messages with deduplication by message_id
              for (const msg of messages.reverse()) {
                if (!msg.message || !msg.id) continue;

                // Check if message already exists
                const { data: existingMsg } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('message_id', msg.id)
                  .maybeSingle();

                if (existingMsg) {
                  console.log(`[FACEBOOK] Skipping duplicate message: ${msg.id}`);
                  continue;
                }

                const { error } = await supabase
                  .from('messages')
                  .insert({
                    conversation_id: conversationId,
                    content: msg.message,
                    sender_type: msg.from?.id === page_id ? 'employee' : 'customer',
                    created_at: msg.created_time,
                    message_id: msg.id,
                    is_old: isInitialImport,
                    reply_sent: isInitialImport
                  });

                if (!error) {
                  totalImported++;
                }
              }
            }
          }

          // Check for next page
          conversationsUrl = conversationsData.paging?.next || null;
        }

        // Update last_fetch_timestamp
        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('channel', 'facebook')
          .eq('is_connected', true);
      }
    }

    // Import WhatsApp Messages (similar pattern)
    const { data: waIntegration } = await supabase
      .from('channel_integrations')
      .select('config, last_fetch_timestamp')
      .eq('channel', 'whatsapp')
      .eq('is_connected', true)
      .single();

    if (waIntegration?.config) {
      console.log('[WHATSAPP] Fetching messages...');
      const config = waIntegration.config as any;
      const { phone_number_id, access_token } = config;

      if (phone_number_id && access_token) {
        let sinceTimestamp = waIntegration.last_fetch_timestamp 
          ? new Date(waIntegration.last_fetch_timestamp).getTime() / 1000
          : (Date.now() - 24 * 60 * 60 * 1000) / 1000;

        // WhatsApp API implementation would go here
        // Similar structure to Facebook with thread_id and message_id deduplication
      }
    }

    console.log(`[AUTO-IMPORT] Completed. Imported ${totalImported} new messages.`);

    // Trigger auto-reply only for new non-old messages
    if (totalImported > 0 && !isInitialImport) {
      console.log('[AUTO-IMPORT] Triggering auto-reply...');
      await supabase.functions.invoke('auto-reply-messages');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: totalImported 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AUTO-IMPORT] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});