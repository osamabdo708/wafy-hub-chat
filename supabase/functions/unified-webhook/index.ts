import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to get app setting from database with fallback to env
async function getAppSetting(supabase: any, key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single();
    
    if (error || !data?.value) {
      // Fallback to environment variable
      return Deno.env.get(key) || Deno.env.get(key.replace('META_', 'FACEBOOK_')) || null;
    }
    return data.value;
  } catch {
    return Deno.env.get(key) || null;
  }
}

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
  
  // Create supabase client for settings lookup
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ============================================
  // WEBHOOK VERIFICATION (GET request from Meta)
  // ============================================
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[UNIFIED-WEBHOOK] Verification request:', { mode, token, challenge });

    // Get verify token from dynamic settings
    const verifyToken = await getAppSetting(supabase, 'META_WEBHOOK_VERIFY_TOKEN');
    
    if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
      console.log('[UNIFIED-WEBHOOK] ✅ Verification successful');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[UNIFIED-WEBHOOK] ❌ Verification failed - token mismatch. Expected:', verifyToken, 'Got:', token);
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

      // Determine channel type from payload
      const objectType = body.object;
      
      // Route based on object type - process ALL matching workspaces
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

      // Find ALL integrations matching this page_id - MULTI-TENANT support
      const integrations = await findAllMatchingIntegrations(supabase, 'facebook', pageId);
      
      if (integrations.length === 0) {
        console.log('[UNIFIED-WEBHOOK] ❌ No Facebook integrations found for page:', pageId);
        continue;
      }

      // Process for EACH matching workspace
      for (const integration of integrations) {
        // Skip self-messages (from our page)
        if (senderId === integration.config.page_id || senderId === integration.account_id) {
          console.log('[UNIFIED-WEBHOOK] Skipping self-message for workspace:', integration.workspace_id);
          continue;
        }

        console.log('[UNIFIED-WEBHOOK] ✅ Processing for workspace:', integration.workspace_id);

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
}

// ============================================
// INSTAGRAM HANDLER
// ============================================
async function handleInstagramMessage(body: any, supabase: any) {
  console.log('[UNIFIED-WEBHOOK] Processing Instagram message');

  for (const entry of body.entry || []) {
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

      // Find ALL integrations matching this Instagram account
      const integrations = await findAllMatchingIntegrations(supabase, 'instagram', recipientId);
      
      if (integrations.length === 0) {
        console.log('[UNIFIED-WEBHOOK] ❌ No Instagram integrations found for:', recipientId);
        continue;
      }

      for (const integration of integrations) {
        if (senderId === integration.config.instagram_account_id || senderId === integration.account_id) {
          console.log('[UNIFIED-WEBHOOK] Skipping self-message for workspace:', integration.workspace_id);
          continue;
        }

        console.log('[UNIFIED-WEBHOOK] ✅ Processing Instagram for workspace:', integration.workspace_id);

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

      const integrations = await findAllMatchingIntegrations(supabase, 'instagram', recipientId);
      
      if (integrations.length === 0) {
        console.log('[UNIFIED-WEBHOOK] ❌ No Instagram integrations found for:', recipientId);
        continue;
      }

      for (const integration of integrations) {
        if (senderId === integration.config.instagram_account_id || senderId === integration.account_id) {
          continue;
        }

        console.log('[UNIFIED-WEBHOOK] ✅ Processing Instagram (changes) for workspace:', integration.workspace_id);

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
}

// ============================================
// WHATSAPP HANDLER
// ============================================
async function handleWhatsAppMessage(body: any, supabase: any) {
  console.log('[UNIFIED-WEBHOOK] Processing WhatsApp message');
  console.log('[UNIFIED-WEBHOOK] WhatsApp payload:', JSON.stringify(body, null, 2));

  for (const entry of body.entry || []) {
    const waId = entry.id; // WhatsApp Business Account ID
    console.log('[UNIFIED-WEBHOOK] WhatsApp entry id (waId):', waId);

    for (const change of entry.changes || []) {
      if (change.field !== 'messages') {
        console.log('[UNIFIED-WEBHOOK] Skipping non-messages field:', change.field);
        continue;
      }

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      const displayPhoneNumber = value.metadata?.display_phone_number;
      const messages = value.messages || [];
      const contacts = value.contacts || [];
      
      console.log('[UNIFIED-WEBHOOK] WhatsApp metadata - phoneNumberId:', phoneNumberId, 'displayPhoneNumber:', displayPhoneNumber);

      for (const message of messages) {
        const senderId = message.from;
        const messageText = message.text?.body;
        const messageId = message.id;
        const timestamp = message.timestamp;

        console.log('[UNIFIED-WEBHOOK] WhatsApp message from:', senderId, 'text:', messageText?.substring(0, 50));

        if (!senderId || !messageId) continue;

        // Find ALL integrations matching this phone_number_id, wa_id, or any connected WhatsApp
        let integrations = await findAllMatchingIntegrations(supabase, 'whatsapp', phoneNumberId, waId);
        
        // If no match found, try to find ANY connected WhatsApp integration
        if (integrations.length === 0) {
          console.log('[UNIFIED-WEBHOOK] No exact match, trying to find any WhatsApp integration...');
          const { data: allWaIntegrations } = await supabase
            .from('channel_integrations')
            .select('id, channel, account_id, workspace_id, config')
            .eq('channel', 'whatsapp')
            .eq('is_connected', true);
          
          if (allWaIntegrations && allWaIntegrations.length > 0) {
            console.log('[UNIFIED-WEBHOOK] Found', allWaIntegrations.length, 'WhatsApp integrations, using first one');
            integrations = allWaIntegrations as ChannelIntegration[];
            
            // Update the integration with the correct phone_number_id for future matching
            const firstIntegration = allWaIntegrations[0];
            const updatedConfig = {
              ...firstIntegration.config,
              phone_number_id: phoneNumberId,
              wa_id: waId,
              display_phone_number: displayPhoneNumber
            };
            
            await supabase
              .from('channel_integrations')
              .update({ 
                config: updatedConfig,
                account_id: phoneNumberId || waId || firstIntegration.account_id
              })
              .eq('id', firstIntegration.id);
            
            console.log('[UNIFIED-WEBHOOK] Updated integration with phone_number_id:', phoneNumberId);
          }
        }
        
        if (integrations.length === 0) {
          console.log('[UNIFIED-WEBHOOK] ❌ No WhatsApp integrations found at all');
          continue;
        }

        // Get contact name
        let customerName = `WhatsApp User ${senderId.slice(-8)}`;
        if (contacts.length > 0 && contacts[0].profile?.name) {
          customerName = contacts[0].profile.name;
        }

        for (const integration of integrations) {
          console.log('[UNIFIED-WEBHOOK] ✅ Processing WhatsApp for workspace:', integration.workspace_id);

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
}

// ============================================
// HELPER: Find ALL Matching Integrations
// Returns ALL workspaces that have connected this account
// ============================================
async function findAllMatchingIntegrations(
  supabase: any,
  channel: string,
  primaryId: string,
  secondaryId?: string
): Promise<ChannelIntegration[]> {
  console.log(`[UNIFIED-WEBHOOK] Finding ALL ${channel} integrations for ID: ${primaryId}${secondaryId ? ` or ${secondaryId}` : ''}`);

  const searchIds = [primaryId];
  if (secondaryId) searchIds.push(secondaryId);

  // Fetch all connected integrations for this channel type
  const { data: integrations, error } = await supabase
    .from('channel_integrations')
    .select('id, channel, account_id, workspace_id, config')
    .eq('channel', channel)
    .eq('is_connected', true);

  if (error) {
    console.error('[UNIFIED-WEBHOOK] Error fetching integrations:', error);
    return [];
  }

  if (!integrations || integrations.length === 0) {
    console.log(`[UNIFIED-WEBHOOK] No ${channel} integrations found in database`);
    return [];
  }

  console.log(`[UNIFIED-WEBHOOK] Checking ${integrations.length} ${channel} integrations for matches...`);

  // Find ALL integrations that match - not just the first one!
  const matchingIntegrations: ChannelIntegration[] = [];

  for (const integration of integrations) {
    const config = integration.config as any;
    
    // Build list of all identifiers for this integration
    const integrationIds = [
      integration.account_id,
      config?.page_id,
      config?.instagram_account_id,
      config?.phone_number_id,
      config?.wa_id
    ].filter(Boolean);

    // Check if any of our search IDs match this integration
    for (const searchId of searchIds) {
      if (integrationIds.includes(searchId)) {
        console.log(`[UNIFIED-WEBHOOK] ✅ MATCH: workspace ${integration.workspace_id}`);
        matchingIntegrations.push(integration as ChannelIntegration);
        break; // Don't add same integration twice
      }
    }
  }

  console.log(`[UNIFIED-WEBHOOK] Found ${matchingIntegrations.length} matching workspaces`);
  return matchingIntegrations;
}

// ============================================
// HELPER: Fetch Meta User Info (name + profile pic)
// ============================================
async function fetchMetaUserInfo(
  userId: string,
  accessToken: string,
  channel: string
): Promise<{ name: string | null; profilePic: string | null }> {
  let name: string | null = null;
  let profilePic: string | null = null;

  if (!accessToken) {
    console.log('[UNIFIED-WEBHOOK] No access token, skipping user info fetch');
    return { name, profilePic };
  }

  try {
    // Different fields for different platforms
    let fields = 'name,profile_pic';
    if (channel === 'instagram') {
      fields = 'name,username,profile_pic';
    } else if (channel === 'facebook') {
      fields = 'first_name,last_name,profile_pic';
    }

    console.log(`[UNIFIED-WEBHOOK] Fetching user info for ${userId} on ${channel}`);
    
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${userId}?fields=${fields}&access_token=${accessToken}`,
      { 
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[UNIFIED-WEBHOOK] User info API error: ${response.status} - ${errorText}`);
      return { name, profilePic };
    }

    const data = await response.json();
    console.log('[UNIFIED-WEBHOOK] User info response:', JSON.stringify(data));

    // Extract profile pic
    profilePic = data.profile_pic || null;

    // Extract name based on channel
    if (channel === 'instagram') {
      // Prefer name, fallback to username with @ prefix
      if (data.name) {
        name = data.name;
      } else if (data.username) {
        name = `@${data.username}`;
      }
    } else if (channel === 'facebook') {
      const firstName = data.first_name || '';
      const lastName = data.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      name = fullName || data.name || null;
    } else {
      name = data.name || null;
    }

    console.log(`[UNIFIED-WEBHOOK] Fetched user info: name="${name}", hasProfilePic=${!!profilePic}`);
  } catch (e) {
    console.log('[UNIFIED-WEBHOOK] Could not fetch user info:', e);
  }

  return { name, profilePic };
}

// ============================================
// HELPER: Save Incoming Message (WORKSPACE-SCOPED)
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

  // Generate workspace-scoped message key for deduplication
  const workspaceScopedMessageId = `${workspaceId}_${messageId}`;

  // Find or create conversation - SCOPED TO THIS WORKSPACE
  const threadId = `${channel}_${senderId}_${recipientId}`;
  const messageTime = typeof timestamp === 'number' ? new Date(timestamp).toISOString() : new Date(parseInt(timestamp as string)).toISOString();

  // Look for existing conversation in THIS workspace ONLY
  let { data: conversation } = await supabase
    .from('conversations')
    .select('id, customer_name, customer_avatar')
    .eq('customer_phone', senderId)
    .eq('channel', channel)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  let conversationId: string;

  // Always try to fetch real user info if we have an access token
  let realName: string | null = customerName || null;
  let realAvatar: string | null = null;

  // Fetch user info from Meta API (for Facebook/Instagram)
  if (accessToken && (channel === 'facebook' || channel === 'instagram')) {
    const userInfo = await fetchMetaUserInfo(senderId, accessToken, channel);
    if (userInfo.name) {
      realName = userInfo.name;
    }
    if (userInfo.profilePic) {
      realAvatar = userInfo.profilePic;
    }
  }

  // Fallback name if we couldn't get real name
  const displayName = realName || `${channel.charAt(0).toUpperCase() + channel.slice(1)} User ${senderId.slice(-8)}`;

  if (conversation) {
    conversationId = conversation.id;
    
    // Build update object - update name/avatar if we got better info
    const updateData: any = { 
      last_message_at: messageTime,
      thread_id: threadId 
    };

    // Update name if we have a real name and current name is generic
    const currentName = conversation.customer_name || '';
    const isGenericName = currentName.includes(' User ') || currentName.startsWith('Instagram User') || currentName.startsWith('Facebook User') || currentName.startsWith('WhatsApp User');
    
    if (realName && (isGenericName || !currentName)) {
      updateData.customer_name = realName;
      console.log(`[UNIFIED-WEBHOOK] Updating conversation name from "${currentName}" to "${realName}"`);
    }

    // Update avatar if we have one and current is empty
    if (realAvatar && !conversation.customer_avatar) {
      updateData.customer_avatar = realAvatar;
      console.log(`[UNIFIED-WEBHOOK] Updating conversation avatar`);
    }

    await supabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId);
    
    console.log('[UNIFIED-WEBHOOK] Updated existing conversation:', conversationId);
  } else {
    // Check workspace settings for default AI enabled
    let defaultAiEnabled = false;
    let aiAgentId: string | null = null;
    
    try {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single();
      
      if (workspace?.settings) {
        const settings = workspace.settings as { default_ai_enabled?: boolean };
        defaultAiEnabled = settings.default_ai_enabled || false;
      }

      // If AI is enabled by default, find the AI agent for this workspace
      if (defaultAiEnabled) {
        const { data: aiAgent } = await supabase
          .from('agents')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('is_ai', true)
          .limit(1)
          .maybeSingle();
        
        if (aiAgent) {
          aiAgentId = aiAgent.id;
        }
      }
    } catch (e) {
      console.log('[UNIFIED-WEBHOOK] Could not fetch workspace settings:', e);
    }

    // Create new conversation IN THIS WORKSPACE
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        customer_name: displayName,
        customer_phone: senderId,
        customer_avatar: realAvatar,
        channel: channel,
        platform: `${channel}_${accountId}`,
        thread_id: threadId,
        status: 'جديد',
        ai_enabled: defaultAiEnabled,
        assigned_agent_id: aiAgentId,
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
          console.log('[UNIFIED-WEBHOOK] Reused existing conversation:', conversationId);
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
      console.log('[UNIFIED-WEBHOOK] Created new conversation:', conversationId, 'with name:', displayName, 'in workspace:', workspaceId);
    }
  }

  // Check for duplicate message - SCOPED BY CONVERSATION (which is already workspace-scoped)
  const { data: existingMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('message_id', messageId)
    .maybeSingle();

  if (existingMsg) {
    console.log('[UNIFIED-WEBHOOK] Message already exists in workspace, skipping:', messageId);
    return;
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
    console.error('[UNIFIED-WEBHOOK] Error saving message:', msgError);
    return;
  }

  console.log('[UNIFIED-WEBHOOK] ✅ Saved message:', messageId, 'to workspace:', workspaceId);

  // Trigger auto-reply if AI is enabled for this conversation
  try {
    const { data: convData } = await supabase
      .from('conversations')
      .select('ai_enabled')
      .eq('id', conversationId)
      .single();

    if (convData?.ai_enabled) {
      console.log('[UNIFIED-WEBHOOK] Triggering auto-reply for conversation:', conversationId);
      await supabase.functions.invoke('auto-reply', {
        body: { conversationId }
      });
    }
  } catch (e) {
    console.log('[UNIFIED-WEBHOOK] Auto-reply trigger error (non-fatal):', e);
  }
}
