import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // GET request - Webhook verification
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      console.log('Webhook verification request:', { mode, token, challenge });

      // Verify token matches what we configured
      if (mode === 'subscribe' && token === 'omnichat_webhook_verify_2024') {
        console.log('Webhook verified successfully');
        return new Response(challenge, { 
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      } else {
        console.log('Webhook verification failed');
        return new Response('Forbidden', { status: 403 });
      }
    }

    // POST request - Incoming messages
    if (req.method === 'POST') {
      const body = await req.json();
      console.log('Received webhook:', JSON.stringify(body, null, 2));

      // Extract message data from WhatsApp webhook
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (!messages || messages.length === 0) {
        console.log('No messages in webhook');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const message = messages[0];
      const contact = value.contacts?.[0];
      
      const customerPhone = message.from;
      const customerName = contact?.profile?.name || customerPhone;
      const messageText = message.text?.body || '';
      const messageType = message.type;
      const messageId = message.id;

      console.log('Processing message:', {
        customerPhone,
        customerName,
        messageText,
        messageType,
        messageId
      });

      // Find or create conversation
      const { data: existingConversation, error: findError } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_phone', customerPhone)
        .eq('channel', 'whatsapp')
        .single();

      let conversationId;

      if (existingConversation) {
        conversationId = existingConversation.id;
        
        // Update conversation last message time
        await supabase
          .from('conversations')
          .update({ 
            last_message_at: new Date().toISOString(),
            status: 'جديد'
          })
          .eq('id', conversationId);
          
        console.log('Updated existing conversation:', conversationId);
      } else {
        // Create new conversation
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            customer_name: customerName,
            customer_phone: customerPhone,
            channel: 'whatsapp',
            status: 'جديد',
            last_message_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (createError) {
          console.error('Error creating conversation:', createError);
          throw createError;
        }

        conversationId = newConversation.id;
        console.log('Created new conversation:', conversationId);
      }

      // Create message
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: messageText,
          sender_type: 'customer',
          is_read: false,
          attachments: messageType !== 'text' ? { type: messageType } : null
        });

      if (messageError) {
        console.error('Error creating message:', messageError);
        throw messageError;
      }

      console.log('Message created successfully');

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
    
  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
