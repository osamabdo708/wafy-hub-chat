import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      console.log('Facebook webhook verification:', { mode, token, challenge });

      if (mode === 'subscribe' && token === 'omnichat_facebook_verify_2024') {
        console.log('Facebook webhook verified successfully');
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      } else {
        console.log('Facebook webhook verification failed');
        return new Response('Forbidden', { status: 403 });
      }
    }

    if (req.method === 'POST') {
      const body = await req.json();
      console.log('Received Facebook webhook:', JSON.stringify(body, null, 2));

      const entry = body.entry?.[0];
      const messaging = entry?.messaging?.[0];

      if (!messaging) {
        console.log('No messaging data in webhook');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const senderId = messaging.sender?.id;
      const message = messaging.message;
      
      // Skip echo messages (messages sent by the page itself)
      if (message?.is_echo) {
        console.log('Skipping echo message (sent by page)');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (!message || !senderId) {
        console.log('No message or sender ID');
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const messageText = message.text || '';
      const messageId = message.mid;

      console.log('Processing Facebook message:', {
        senderId,
        messageText,
        messageId
      });

      // Find or create conversation
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id, ai_enabled')
        .eq('customer_phone', senderId)
        .eq('channel', 'facebook')
        .maybeSingle();

      let conversationId;
      let conversation;

      if (existingConversation) {
        conversationId = existingConversation.id;
        conversation = existingConversation;

        await supabase
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            status: 'جديد'
          })
          .eq('id', conversationId);

        console.log('Updated existing Facebook conversation:', conversationId);
      } else {
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            customer_name: `Facebook User ${senderId.substring(0, 8)}`,
            customer_phone: senderId,
            channel: 'facebook',
            status: 'جديد',
            last_message_at: new Date().toISOString()
          })
          .select('id, ai_enabled')
          .single();

        if (createError) {
          console.error('Error creating conversation:', createError);
          throw createError;
        }

        conversationId = newConversation.id;
        conversation = newConversation;
        console.log('Created new Facebook conversation:', conversationId);
      }

      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: messageText,
          sender_type: 'customer',
          is_read: false,
          attachments: message.attachments ? { attachments: message.attachments } : null
        });

      if (messageError) {
        console.error('Error creating message:', messageError);
        throw messageError;
      }

      console.log('Facebook message created successfully');

      // Check if AI is enabled for this conversation
      if (conversation?.ai_enabled) {
        console.log('AI enabled, triggering AI response...');
        try {
          await supabase.functions.invoke('ai-chat-handler', {
            body: {
              conversationId: conversationId,
              newMessage: messageText
            }
          });
        } catch (aiError) {
          console.error('Error invoking AI handler:', aiError);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });

  } catch (error) {
    console.error('Facebook webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
