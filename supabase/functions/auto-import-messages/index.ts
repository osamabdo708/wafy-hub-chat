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
    const { data: isFirstRun } = await supabase
      .from('messages')
      .select('id')
      .limit(1)
      .single();
    
    const isInitialImport = !isFirstRun;

    // Import Facebook Messages
    const { data: fbIntegration } = await supabase
      .from('channel_integrations')
      .select('config')
      .eq('channel', 'facebook')
      .eq('is_connected', true)
      .single();

    if (fbIntegration?.config) {
      const config = fbIntegration.config as any;
      const { page_id, page_access_token } = config;

      if (page_id && page_access_token) {
        console.log('[FACEBOOK] Fetching conversations...');
        const conversationsUrl = `https://graph.facebook.com/v18.0/${page_id}/conversations?fields=id,senders,messages{id,message,from,created_time}&access_token=${page_access_token}`;
        const conversationsResponse = await fetch(conversationsUrl);
        const conversationsData = await conversationsResponse.json();

        if (conversationsData.data) {
          for (const fbConv of conversationsData.data) {
            const senderId = fbConv.senders?.data[0]?.id || 'unknown';
            const messages = fbConv.messages?.data || [];
            
            if (messages.length === 0) continue;

            // Get or create conversation
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id, ai_enabled')
              .eq('customer_phone', senderId)
              .eq('channel', 'facebook')
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
                  status: 'جديد',
                  last_message_at: messages[0].created_time
                })
                .select()
                .single();

              conversationId = newConv.id;
            }

            // Import messages with deduplication
            for (const msg of messages.reverse()) {
              if (!msg.message || !msg.id) continue;

              const { error } = await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  content: msg.message,
                  sender_type: msg.from?.id === page_id ? 'agent' : 'customer',
                  created_at: msg.created_time,
                  message_id: msg.id,
                  is_old: isInitialImport,
                  reply_sent: isInitialImport
                })
                .select();

              if (!error) {
                totalImported++;
              }
            }
          }
        }
      }
    }

    // Import WhatsApp Messages (similar pattern)
    const { data: waIntegration } = await supabase
      .from('channel_integrations')
      .select('config')
      .eq('channel', 'whatsapp')
      .eq('is_connected', true)
      .single();

    if (waIntegration?.config) {
      console.log('[WHATSAPP] Fetching messages...');
      // WhatsApp import logic here (similar to Facebook)
    }

    console.log(`[AUTO-IMPORT] Completed. Imported ${totalImported} new messages.`);

    // Trigger auto-reply
    if (totalImported > 0) {
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
