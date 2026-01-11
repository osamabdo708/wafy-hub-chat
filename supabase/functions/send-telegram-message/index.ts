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
    const { conversationId, message, chatId, botToken } = await req.json();
    
    console.log('[SEND-TELEGRAM] Request:', { conversationId, chatId: chatId?.substring(0, 5), hasMessage: !!message });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let targetChatId = chatId;
    let targetBotToken = botToken;
    let workspaceId: string | null = null;

    // If conversationId is provided, get chat ID and bot token from database
    if (conversationId && (!targetChatId || !targetBotToken)) {
      // Get conversation details
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('customer_phone, workspace_id')
        .eq('id', conversationId)
        .single();

      if (convError || !conversation) {
        console.error('[SEND-TELEGRAM] Conversation not found:', convError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Conversation not found' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      targetChatId = conversation.customer_phone;
      workspaceId = conversation.workspace_id;

      // Get Telegram integration for this workspace
      const { data: integration, error: intError } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('workspace_id', workspaceId)
        .eq('channel', 'telegram')
        .eq('is_connected', true)
        .single();

      if (intError || !integration) {
        console.error('[SEND-TELEGRAM] Telegram integration not found:', intError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Telegram integration not configured' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const config = integration.config as any;
      targetBotToken = config?.bot_token;
    }

    if (!targetChatId || !targetBotToken) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing chat ID or bot token' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!message) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Message is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send message via Telegram API
    console.log('[SEND-TELEGRAM] Sending message to chat:', targetChatId);
    
    const response = await fetch(`https://api.telegram.org/bot${targetBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const data = await response.json();
    console.log('[SEND-TELEGRAM] Response:', JSON.stringify(data));

    if (!data.ok) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: data.description || 'Failed to send message' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Save outgoing message to database if we have a conversation
    if (conversationId) {
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: message,
          sender_type: 'agent',
          message_id: String(data.result.message_id),
          is_old: false,
          reply_sent: true,
          is_read: true
        });

      if (msgError) {
        console.error('[SEND-TELEGRAM] Error saving message:', msgError);
      } else {
        // Update conversation last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId);
      }
    }

    console.log('[SEND-TELEGRAM] ✅ Message sent successfully');

    return new Response(JSON.stringify({ 
      success: true,
      message_id: data.result.message_id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[SEND-TELEGRAM] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
