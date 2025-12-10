import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversationId: string;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { conversationId, message }: SendMessageRequest = await req.json();

    if (!conversationId || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing conversationId or message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending message for conversation:', conversationId);

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { channel, workspace_id, customer_phone, thread_id } = conversation;
    const recipientId = customer_phone || thread_id;

    console.log('Conversation details:', { channel, workspace_id, recipientId });

    // Get channel integration config for this workspace and channel
    const { data: integration, error: integrationError } = await supabase
      .from('channel_integrations')
      .select('*')
      .eq('workspace_id', workspace_id)
      .eq('channel', channel)
      .eq('is_connected', true)
      .maybeSingle();

    if (integrationError || !integration) {
      console.error('Channel integration not found:', integrationError);
      return new Response(
        JSON.stringify({ error: `No ${channel} integration found for this workspace` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = integration.config as any;
    console.log('Using integration config for account:', integration.account_id);

    // Send message based on channel type
    let sendResult;
    switch (channel) {
      case 'facebook':
        sendResult = await sendFacebookMessage(recipientId, message, config);
        break;
      case 'instagram':
        sendResult = await sendInstagramMessage(recipientId, message, config);
        break;
      case 'whatsapp':
        sendResult = await sendWhatsAppMessage(recipientId, message, config);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported channel: ${channel}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    if (!sendResult.success) {
      console.error('Failed to send message:', sendResult.error);
      return new Response(
        JSON.stringify({ error: sendResult.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Message sent successfully, messageId:', sendResult.messageId);

    // Save message to database
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: message,
        sender_type: 'agent',
        message_id: sendResult.messageId,
        is_old: false,
        reply_sent: true,
        is_read: true,
        created_at: new Date().toISOString(),
      });

    if (msgError) {
      console.error('Error saving message:', msgError);
    }

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ 
        last_message_at: new Date().toISOString(),
        status: 'مفتوح'
      })
      .eq('id', conversationId);

    return new Response(
      JSON.stringify({ success: true, messageId: sendResult.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Send message error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// FACEBOOK MESSENGER
// ============================================================================
async function sendFacebookMessage(recipientId: string, message: string, config: any) {
  const pageAccessToken = config.page_access_token;
  const pageId = config.page_id;

  if (!pageAccessToken) {
    return { success: false, error: 'Missing Facebook page access token' };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          access_token: pageAccessToken,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('Facebook API error:', data);
      return { success: false, error: data.error?.message || 'Failed to send Facebook message' };
    }

    return { success: true, messageId: data.message_id };
  } catch (e: unknown) {
    console.error('Facebook send error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ============================================================================
// INSTAGRAM
// ============================================================================
async function sendInstagramMessage(recipientId: string, message: string, config: any) {
  const pageAccessToken = config.page_access_token;
  const instagramAccountId = config.instagram_account_id;

  if (!pageAccessToken || !instagramAccountId) {
    return { success: false, error: 'Missing Instagram credentials' };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${instagramAccountId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          access_token: pageAccessToken,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('Instagram API error:', data);
      return { success: false, error: data.error?.message || 'Failed to send Instagram message' };
    }

    return { success: true, messageId: data.message_id };
  } catch (e: unknown) {
    console.error('Instagram send error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ============================================================================
// WHATSAPP
// ============================================================================
async function sendWhatsAppMessage(recipientId: string, message: string, config: any) {
  const accessToken = config.access_token;
  const phoneNumberId = config.phone_number_id;

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'Missing WhatsApp credentials' };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientId,
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('WhatsApp API error:', data);
      return { success: false, error: data.error?.message || 'Failed to send WhatsApp message' };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (e: unknown) {
    console.error('WhatsApp send error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
