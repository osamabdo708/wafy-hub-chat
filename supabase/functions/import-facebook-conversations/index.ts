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

    console.log('Starting Facebook conversations import...');

    // Get Facebook credentials
    const { data: integration, error: integrationError } = await supabase
      .from('channel_integrations')
      .select('config')
      .eq('channel', 'facebook')
      .single();

    if (integrationError || !integration?.config) {
      console.error('Failed to get Facebook credentials:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Facebook not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const config = integration.config as any;
    const { page_id, page_access_token } = config;

    if (!page_id || !page_access_token) {
      console.error('Missing page_id or page_access_token', { page_id, hasToken: !!page_access_token });
      return new Response(
        JSON.stringify({ error: 'Invalid Facebook configuration' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get the numeric page ID from Facebook
    const pageInfoUrl = `https://graph.facebook.com/v18.0/${page_id}?fields=id&access_token=${page_access_token}`;
    const pageInfoResponse = await fetch(pageInfoUrl);
    const pageInfo = await pageInfoResponse.json();
    const numericPageId = pageInfo.id;
    
    console.log(`Numeric Page ID: ${numericPageId}`);

    // Fetch conversations from Facebook Graph API
    const conversationsUrl = `https://graph.facebook.com/v18.0/${page_id}/conversations?fields=id,senders,messages{message,from,created_time}&access_token=${page_access_token}`;
    console.log('Fetching conversations from Facebook...');
    
    const conversationsResponse = await fetch(conversationsUrl);
    const conversationsData = await conversationsResponse.json();

    if (conversationsData.error) {
      console.error('Facebook API error:', conversationsData.error);
      return new Response(
        JSON.stringify({ error: conversationsData.error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Found ${conversationsData.data?.length || 0} conversations`);

    let importedCount = 0;

    // Process each conversation
    if (conversationsData.data) {
      for (const fbConversation of conversationsData.data) {
        try {
          const senderId = fbConversation.senders?.data[0]?.id || 'unknown';
          const messages = fbConversation.messages?.data || [];
          
          if (messages.length === 0) continue;

          const lastMessage = messages[0]; // Messages are ordered by newest first
          
          // Get sender name from Facebook API
          const userUrl = `https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${page_access_token}`;
          const userResponse = await fetch(userUrl);
          const userData = await userResponse.json();
          const customerName = userData.name || `عميل ${senderId.substring(0, 8)}`;

          // Check if conversation already exists
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_phone', senderId)
            .eq('channel', 'facebook')
            .single();

          let conversationId;

          if (existingConv) {
            // Update existing conversation
            conversationId = existingConv.id;
            await supabase
              .from('conversations')
              .update({
                last_message_at: lastMessage.created_time,
                updated_at: new Date().toISOString()
              })
              .eq('id', conversationId);
          } else {
            // Create new conversation
            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                customer_name: customerName,
                customer_phone: senderId,
                channel: 'facebook',
                status: 'جديد',
                last_message_at: lastMessage.created_time
              })
              .select()
              .single();

            if (convError) {
              console.error('Error creating conversation:', convError);
              continue;
            }

            conversationId = newConv.id;
          }

          // Import messages (limit to last 10 to avoid overload)
          const messagesToImport = messages.slice(0, 10).reverse();
          
          for (const msg of messagesToImport) {
            if (!msg.message) continue;

            // Determine sender type - if from numeric page ID it's agent, otherwise customer
            const isFromPage = msg.from?.id === numericPageId;
            const senderType = isFromPage ? 'agent' : 'customer';

            console.log(`Message from ${msg.from?.id} (page: ${numericPageId}) - Type: ${senderType}`);

            // Check if message already exists by conversation, content, timestamp, AND sender type
            const { data: existingMsg } = await supabase
              .from('messages')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('content', msg.message)
              .eq('created_at', msg.created_time)
              .eq('sender_type', senderType)
              .single();

            if (!existingMsg) {
              await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  content: msg.message,
                  sender_type: senderType,
                  created_at: msg.created_time
                });
            }
          }

          importedCount++;
        } catch (error) {
          console.error('Error processing conversation:', error);
        }
      }
    }

    console.log(`Successfully imported ${importedCount} conversations`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: importedCount,
        message: `تم استيراد ${importedCount} محادثة بنجاح`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in import function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
