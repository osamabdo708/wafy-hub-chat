import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Single unified verify token for ALL channels and ALL workspaces
const UNIFIED_VERIFY_TOKEN = "almared_unified_webhook_2024";

interface ChannelIntegration {
  id: string;
  channel: string;
  account_id: string;
  workspace_id: string;
  config: {
    page_id?: string;
    page_access_token?: string;
    instagram_account_id?: string;
    phone_number_id?: string;
    wa_id?: string;
    access_token?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ============================================
  // WEBHOOK VERIFICATION (GET request from Meta)
  // ============================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[UNIFIED-WEBHOOK] Verification request:', { mode, token, challenge });

    if (mode === 'subscribe' && token === UNIFIED_VERIFY_TOKEN) {
      console.log('[UNIFIED-WEBHOOK] ✅ Verification successful');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[UNIFIED-WEBHOOK] ❌ Verification failed - token mismatch');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // ============================================
  // INCOMING MESSAGES (POST request from Meta)
  // ============================================
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[UNIFIED-WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Determine channel type from payload
      const objectType = body.object;
      
      // Route based on object type
      if (objectType === 'whatsapp_business_account') {
        await handleWhatsAppMessage(body, supabase);
      } else if (objectType === 'instagram') {
        await handleInstagramMessage(body, supabase);
      } else if (objectType === 'page') {
        await handleFacebookMessage(body, supabase);
      } else {
        console.log('[UNIFIED-WEBHOOK] Unknown object type:', objectType);
      }

      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('[UNIFIED-WEBHOOK] Error:', error);
      // Always return 200 to prevent Meta from retrying
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});

// ============================================
// FACEBOOK MESSENGER HANDLER
// ============================================
async function handleFacebookMessage(body: any, supabase: any) {
  console.log('[UNIFIED-WEBHOOK] Processing Facebook Messenger message');

  for (const entry of body.entry || []) {
    const pageId = entry.id;

    for (const messaging of entry.messaging || []) {
      const senderId = messaging.sender?.id;
      const recipientId = messaging.recipient?.id;
      const messageText = messaging.message?.text;
      const attachmentUrl = messaging.message?.attachments?.[0]?.payload?.url;
      const content = messageText || attachmentUrl || '[Media]';
      const messageId = messaging.message?.mid;
      const timestamp = messaging.timestamp;

      // Skip if missing required data
      if (!senderId || !messageId) continue;

      // Find the integration by page_id (account_id) - workspace-scoped lookup
      const integration = await findIntegration(supabase, 'facebook', [pageId, recipientId]);
      if (!integration) {
        console.log('[UNIFIED-WEBHOOK] ❌ No Facebook integration found for page:', pageId);
        continue;
      }

      // Skip self-messages (from our page)
      if (senderId === integration.config.page_id || senderId === integration.account_id) {
        console.log('[UNIFIED-WEBHOOK] Skipping self-message');
        continue;
      }

      console.log('[UNIFIED-WEBHOOK] ✅ Matched Facebook integration:', {
        workspace_id: integration.workspace_id,
        account_id: integration.account_id
      });

      await saveIncomingMessage(supabase, {
        channel: 'facebook',
        workspaceId: integration.workspace_id,
        accountId: integration.account_id,
        senderId,
        recipientId,
        content,
        messageId,
        timestamp,
        accessToken: integration.config.page_access_token
      });
    }
  }
}

// ============================================
// INSTAGRAM HANDLER
// ============================================
async function handleInstagramMessage(body: any, supabase: any) {
  console.log('[UNIFIED-WEBHOOK] Processing Instagram message');

  for (const entry of body.entry || []) {
    // Instagram can send via entry.messaging (older) or entry.changes (newer API)
    
    // Handle entry.messaging format
    for (const messaging of entry.messaging || []) {
      const senderId = messaging.sender?.id;
      const recipientId = messaging.recipient?.id;
      const messageText = messaging.message?.text;
      const attachmentUrl = messaging.message?.attachments?.[0]?.payload?.url;
      const content = messageText || attachmentUrl || '[Media]';
      const messageId = messaging.message?.mid;
      const timestamp = messaging.timestamp;

      if (!senderId || !messageId) continue;

      const integration = await findIntegration(supabase, 'instagram', [recipientId, entry.id]);
      if (!integration) {
        console.log('[UNIFIED-WEBHOOK] ❌ No Instagram integration found for:', recipientId);
        continue;
      }

      if (senderId === integration.config.instagram_account_id || senderId === integration.account_id) {
        console.log('[UNIFIED-WEBHOOK] Skipping self-message');
        continue;
      }

      console.log('[UNIFIED-WEBHOOK] ✅ Matched Instagram integration:', {
        workspace_id: integration.workspace_id,
        account_id: integration.account_id
      });

      await saveIncomingMessage(supabase, {
        channel: 'instagram',
        workspaceId: integration.workspace_id,
        accountId: integration.account_id,
        senderId,
        recipientId,
        content,
        messageId,
        timestamp,
        accessToken: integration.config.page_access_token
      });
    }

    // Handle entry.changes format (Instagram Messaging API)
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value || value.messaging_product !== "instagram") continue;
      if (!value.message) continue;

      const senderId = value.sender?.id;
      const recipientId = value.recipient?.id;
      const messageText = value.message?.text;
      const attachmentUrl = value.message?.attachments?.[0]?.payload?.url;
      const content = messageText || attachmentUrl || '[Media]';
      const messageId = value.message?.mid;
      const timestamp = value.timestamp;

      if (!senderId || !messageId) continue;

      const integration = await findIntegration(supabase, 'instagram', [recipientId, entry.id]);
      if (!integration) {
        console.log('[UNIFIED-WEBHOOK] ❌ No Instagram integration found for:', recipientId);
        continue;
      }

      if (senderId === integration.config.instagram_account_id || senderId === integration.account_id) {
        console.log('[UNIFIED-WEBHOOK] Skipping self-message');
        continue;
      }

      console.log('[UNIFIED-WEBHOOK] ✅ Matched Instagram integration:', {
        workspace_id: integration.workspace_id,
        account_id: integration.account_id
      });

      await saveIncomingMessage(supabase, {
        channel: 'instagram',
        workspaceId: integration.workspace_id,
        accountId: integration.account_id,
        senderId,
        recipientId,
        content,
        messageId,
        timestamp,
        accessToken: integration.config.page_access_token
      });
    }
  }
}

// ============================================
// WHATSAPP HANDLER
// ============================================
async function handleWhatsAppMessage(body: any, supabase: any) {
  console.log('[UNIFIED-WEBHOOK] Processing WhatsApp message');

  for (const entry of body.entry || []) {
    const waId = entry.id; // WhatsApp Business Account ID

    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      const messages = value.messages || [];
      const contacts = value.contacts || [];

      for (const message of messages) {
        const senderId = message.from;
        const messageText = message.text?.body;
        const messageId = message.id;
        const timestamp = message.timestamp;

        if (!senderId || !messageId) continue;

        // Find integration by wa_id or phone_number_id
        const integration = await findIntegration(supabase, 'whatsapp', [waId, phoneNumberId]);
        if (!integration) {
          console.log('[UNIFIED-WEBHOOK] ❌ No WhatsApp integration found for:', waId);
          continue;
        }

        console.log('[UNIFIED-WEBHOOK] ✅ Matched WhatsApp integration:', {
          workspace_id: integration.workspace_id,
          account_id: integration.account_id
        });

        // Get contact name
        let customerName = `WhatsApp User ${senderId.slice(-8)}`;
        if (contacts.length > 0 && contacts[0].profile?.name) {
          customerName = contacts[0].profile.name;
        }

        await saveIncomingMessage(supabase, {
          channel: 'whatsapp',
          workspaceId: integration.workspace_id,
          accountId: integration.account_id,
          senderId,
          recipientId: phoneNumberId,
          content: messageText || '[Media]',
          messageId,
          timestamp: parseInt(timestamp) * 1000,
          accessToken: integration.config.access_token || integration.config.page_access_token,
          customerName
        });
      }
    }
  }
}

// ============================================
// HELPER: Find Integration by Account Identifiers
// ============================================
async function findIntegration(
  supabase: any,
  channel: string,
  potentialIds: (string | undefined)[]
): Promise<ChannelIntegration | null> {
  const validIds = potentialIds.filter(Boolean);

  // Query channel_integrations for this channel
  const { data: integrations, error } = await supabase
    .from('channel_integrations')
    .select('id, channel, account_id, workspace_id, config')
    .eq('channel', channel)
    .eq('is_connected', true);

  if (error) {
    console.error('[UNIFIED-WEBHOOK] Error fetching integrations:', error);
    return null;
  }

  if (!integrations || integrations.length === 0) {
    return null;
  }

  // Match by account identifiers stored in config or account_id
  for (const integration of integrations) {
    const config = integration.config as any;
    
    const matchIds = [
      integration.account_id,
      config?.page_id,
      config?.instagram_account_id,
      config?.phone_number_id,
      config?.wa_id
    ].filter(Boolean);

    for (const id of validIds) {
      if (matchIds.includes(id)) {
        return integration as ChannelIntegration;
      }
    }
  }

  return null;
}

// ============================================
// HELPER: Save Incoming Message
// ============================================
async function saveIncomingMessage(
  supabase: any,
  params: {
    channel: string;
    workspaceId: string;
    accountId: string;
    senderId: string;
    recipientId: string;
    content: string;
    messageId: string;
    timestamp: number | string;
    accessToken?: string;
    customerName?: string;
  }
) {
  const { channel, workspaceId, accountId, senderId, recipientId, content, messageId, timestamp, accessToken, customerName } = params;

  // Check for duplicate message
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existingMsg) {
    console.log('[UNIFIED-WEBHOOK] Message already exists, skipping:', messageId);
    return;
  }

  // Find or create conversation
  const threadId = `${channel}_${senderId}_${recipientId}`;
  const messageTime = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : new Date(parseInt(timestamp as string)).toISOString();

  // Look for existing conversation in THIS workspace
  let { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_phone', senderId)
    .eq('channel', channel)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  let conversationId: string;

  if (conversation) {
    conversationId = conversation.id;
    // Update last message time
    await supabase
      .from('conversations')
      .update({ 
        last_message_at: messageTime,
        thread_id: threadId 
      })
      .eq('id', conversationId);
    console.log('[UNIFIED-WEBHOOK] Updated existing conversation:', conversationId);
  } else {
    // Get customer name if not provided
    let name = customerName;
    if (!name && accessToken) {
      try {
        const nameResponse = await fetch(
          `https://graph.facebook.com/v21.0/${senderId}?fields=name,username&access_token=${accessToken}`
        );
        const nameData = await nameResponse.json();
        if (channel === 'instagram' && nameData.username) {
          name = `@${nameData.username}`;
        } else if (nameData.name) {
          name = nameData.name;
        }
      } catch (e) {
        console.log('[UNIFIED-WEBHOOK] Could not fetch customer name');
      }
    }
    
    name = name || `${channel.charAt(0).toUpperCase() + channel.slice(1)} User ${senderId.slice(-8)}`;

    // Create new conversation
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        customer_name: name,
        customer_phone: senderId,
        channel: channel,
        platform: `${channel}_${accountId}`,
        thread_id: threadId,
        status: 'جديد',
        ai_enabled: false,
        last_message_at: messageTime
      })
      .select('id')
      .single();

    if (convError) {
      // Handle duplicate key error
      if ((convError as any).code === '23505') {
        const { data: dupConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('customer_phone', senderId)
          .eq('channel', channel)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        
        if (dupConv) {
          conversationId = dupConv.id;
          console.log('[UNIFIED-WEBHOOK] Reused existing conversation after dup key:', conversationId);
        } else {
          console.error('[UNIFIED-WEBHOOK] Error creating conversation:', convError);
          return;
        }
      } else {
        console.error('[UNIFIED-WEBHOOK] Error creating conversation:', convError);
        return;
      }
    } else {
      conversationId = newConv.id;
      console.log('[UNIFIED-WEBHOOK] Created new conversation:', conversationId);
    }
  }

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
      created_at: messageTime
    });

  if (msgError) {
    console.error('[UNIFIED-WEBHOOK] Error inserting message:', msgError);
  } else {
    console.log('[UNIFIED-WEBHOOK] ✅ Message saved successfully for', channel);

    // Trigger AI auto-reply
    try {
      await supabase.functions.invoke('auto-reply-messages');
    } catch (e) {
      console.log('[UNIFIED-WEBHOOK] Auto-reply trigger failed:', e);
    }
  }
}
