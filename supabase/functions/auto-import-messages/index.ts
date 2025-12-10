import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * AUTO-IMPORT MESSAGES
 * 
 * Polls Meta APIs to import messages for all connected integrations.
 * Each integration is workspace-scoped - messages are saved to the correct workspace.
 * 
 * CRITICAL: When looking up existing conversations, ALWAYS filter by workspace_id
 * to prevent cross-workspace message mixing.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[AUTO-IMPORT] Starting automated message import...');

    // Fetch all connected integrations with their workspace_id
    const { data: integrations, error: integrationsError } = await supabase
      .from('channel_integrations')
      .select('id, channel, config, workspace_id, account_id, last_fetch_timestamp')
      .eq('is_connected', true);

    if (integrationsError) {
      console.error('[AUTO-IMPORT] Error fetching integrations:', integrationsError);
      throw integrationsError;
    }

    console.log(`[AUTO-IMPORT] Found ${integrations?.length || 0} connected integrations`);
    
    if (!integrations || integrations.length === 0) {
      console.log('[AUTO-IMPORT] No connected integrations found.');
      return new Response(
        JSON.stringify({ success: true, imported: 0, message: 'No connected integrations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is initial import (no existing messages)
    const { data: existingMessages } = await supabase
      .from('messages')
      .select('id')
      .limit(1);
    
    const isInitialImport = !existingMessages || existingMessages.length === 0;
    console.log(`[AUTO-IMPORT] Is initial import: ${isInitialImport}`);

    let totalImported = 0;

    // Process each connected integration
    for (const integration of integrations) {
      const channelName = integration.channel.toUpperCase();
      const workspaceId = integration.workspace_id;
      
      console.log(`\n[${channelName}] Processing integration for workspace: ${workspaceId}`);
      
      if (!integration.config) {
        console.log(`[${channelName}] Skipping - no configuration found`);
        continue;
      }

      if (!workspaceId) {
        console.log(`[${channelName}] Skipping - no workspace_id`);
        continue;
      }

      const config = integration.config as any;

      // Process based on channel type
      if (integration.channel === 'facebook') {
        const imported = await importFacebookMessages(supabase, integration, config, isInitialImport);
        totalImported += imported;
      } else if (integration.channel === 'instagram') {
        const imported = await importInstagramMessages(supabase, integration, config, isInitialImport);
        totalImported += imported;
      } else if (integration.channel === 'whatsapp') {
        console.log(`[${channelName}] WhatsApp uses webhook-only delivery`);
      }

      // Update last fetch timestamp
      await supabase
        .from('channel_integrations')
        .update({ last_fetch_timestamp: new Date().toISOString() })
        .eq('id', integration.id);
    }

    console.log(`\n[AUTO-IMPORT] ✅ Complete. Total messages imported: ${totalImported}`);

    return new Response(
      JSON.stringify({ success: true, imported: totalImported }),
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

// ============================================
// FACEBOOK MESSENGER IMPORT
// ============================================
async function importFacebookMessages(
  supabase: any, 
  integration: any, 
  config: any,
  isInitialImport: boolean
): Promise<number> {
  const { page_id, page_access_token } = config;
  const workspaceId = integration.workspace_id;
  
  if (!page_id || !page_access_token) {
    console.log('[FACEBOOK] Skipping - missing credentials');
    return 0;
  }

  console.log(`[FACEBOOK] Importing for page: ${page_id}, workspace: ${workspaceId}`);

  // Calculate fetch window with 5 minute buffer
  let lastFetchTime = integration.last_fetch_timestamp 
    ? new Date(integration.last_fetch_timestamp)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  lastFetchTime = new Date(lastFetchTime.getTime() - 5 * 60 * 1000);

  console.log(`[FACEBOOK] Fetching messages since: ${lastFetchTime.toISOString()}`);

  let conversationsUrl = `https://graph.facebook.com/v21.0/${page_id}/conversations?fields=id,participants,updated_time,messages{id,message,from,created_time}&limit=100&access_token=${page_access_token}`;
  
  let imported = 0;

  while (conversationsUrl) {
    const response = await fetch(conversationsUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[FACEBOOK] API error: ${response.status} - ${errorText}`);
      break;
    }
    
    const data = await response.json();
    console.log(`[FACEBOOK] Received ${data.data?.length || 0} conversations`);

    for (const fbConv of data.data || []) {
      const threadId = fbConv.id;
      const participants = fbConv.participants?.data || [];
      const senderId = participants.find((p: any) => p.id !== page_id)?.id || 'unknown';
      const allMessages = fbConv.messages?.data || [];
      
      // Filter messages by time
      const messages = allMessages.filter((msg: any) => {
        const msgTime = new Date(msg.created_time);
        return msgTime >= lastFetchTime;
      });
      
      if (messages.length === 0) continue;

      console.log(`[FACEBOOK] Thread ${threadId}: ${messages.length} new messages`);

      // Get or create conversation - SCOPED TO THIS WORKSPACE
      const conversationId = await getOrCreateConversation(
        supabase, 
        workspaceId, 
        'facebook', 
        senderId, 
        threadId, 
        page_access_token,
        messages[0].created_time
      );

      if (!conversationId) continue;

      // Import messages
      for (const msg of messages.reverse()) {
        if (!msg || !msg.message || !msg.id) continue;

        // Check for duplicate
        const { data: existingMsg } = await supabase
          .from('messages')
          .select('id')
          .eq('message_id', msg.id)
          .maybeSingle();

        if (existingMsg) continue;

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

        if (!error) imported++;
      }
    }

    conversationsUrl = data.paging?.next || null;
  }

  console.log(`[FACEBOOK] Imported ${imported} messages for workspace: ${workspaceId}`);
  return imported;
}

// ============================================
// INSTAGRAM IMPORT
// ============================================
async function importInstagramMessages(
  supabase: any, 
  integration: any, 
  config: any,
  isInitialImport: boolean
): Promise<number> {
  const { instagram_account_id, page_id, page_access_token, access_token } = config;
  const workspaceId = integration.workspace_id;
  const token = page_access_token || access_token;
  
  if (!token) {
    console.log('[INSTAGRAM] Skipping - missing access token');
    return 0;
  }

  console.log(`[INSTAGRAM] Importing for account: ${instagram_account_id}, workspace: ${workspaceId}`);

  // Calculate fetch window with 5 minute buffer
  let lastFetchTime = integration.last_fetch_timestamp 
    ? new Date(integration.last_fetch_timestamp)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  lastFetchTime = new Date(lastFetchTime.getTime() - 5 * 60 * 1000);

  console.log(`[INSTAGRAM] Fetching messages since: ${lastFetchTime.toISOString()}`);

  // Use Facebook Page endpoint for Instagram conversations (more reliable)
  let conversationsUrl = page_id 
    ? `https://graph.facebook.com/v21.0/${page_id}/conversations?platform=instagram&fields=id,participants,messages{id,message,from,created_time}&access_token=${token}`
    : `https://graph.instagram.com/${instagram_account_id}/conversations?fields=id,participants,messages{id,message,from,created_time}&platform=instagram&access_token=${token}`;
  
  let imported = 0;

  while (conversationsUrl) {
    const response = await fetch(conversationsUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[INSTAGRAM] API error: ${errorText}`);
      break;
    }
    
    const data = await response.json();
    console.log(`[INSTAGRAM] Received ${data.data?.length || 0} conversations`);

    for (const igConv of data.data || []) {
      const threadId = igConv.id;
      const senderId = igConv.participants?.data?.[0]?.id || 'unknown';
      const allMessages = igConv.messages?.data || [];
      
      // Filter messages by time
      const messages = allMessages.filter((msg: any) => {
        const msgTime = new Date(msg.created_time);
        return msgTime >= lastFetchTime;
      });
      
      if (messages.length === 0) continue;

      console.log(`[INSTAGRAM] Thread ${threadId}: ${messages.length} new messages`);

      // Get or create conversation - SCOPED TO THIS WORKSPACE
      const conversationId = await getOrCreateConversation(
        supabase, 
        workspaceId, 
        'instagram', 
        senderId, 
        threadId, 
        token,
        messages[0].created_time
      );

      if (!conversationId) continue;

      // Import messages
      for (const msg of messages.reverse()) {
        if (!msg || !msg.message || !msg.id) continue;

        // Check for duplicate
        const { data: existingMsg } = await supabase
          .from('messages')
          .select('id')
          .eq('message_id', msg.id)
          .maybeSingle();

        if (existingMsg) continue;

        const { error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            content: msg.message,
            sender_type: msg.from?.id === instagram_account_id ? 'employee' : 'customer',
            created_at: msg.created_time,
            message_id: msg.id,
            is_old: isInitialImport,
            reply_sent: isInitialImport
          });

        if (!error) imported++;
      }
    }

    conversationsUrl = data.paging?.next || null;
  }

  console.log(`[INSTAGRAM] Imported ${imported} messages for workspace: ${workspaceId}`);
  return imported;
}

// ============================================
// HELPER: Get or Create Conversation (WORKSPACE SCOPED)
// ============================================
async function getOrCreateConversation(
  supabase: any,
  workspaceId: string,
  channel: string,
  senderId: string,
  threadId: string,
  accessToken: string,
  lastMessageTime: string
): Promise<string | null> {
  // CRITICAL: Always query with workspace_id to prevent cross-workspace mixing
  let { data: existingConv } = await supabase
    .from('conversations')
    .select('id, thread_id')
    .eq('customer_phone', senderId)
    .eq('channel', channel)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!existingConv) {
    // Try by thread_id as fallback
    const { data: convByThread } = await supabase
      .from('conversations')
      .select('id, thread_id')
      .eq('thread_id', threadId)
      .eq('channel', channel)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    
    existingConv = convByThread;
  }

  if (existingConv) {
    // Update existing conversation
    if (existingConv.thread_id !== threadId) {
      await supabase
        .from('conversations')
        .update({ thread_id: threadId })
        .eq('id', existingConv.id);
    }
    
    await supabase
      .from('conversations')
      .update({ 
        last_message_at: lastMessageTime,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingConv.id);

    return existingConv.id;
  }

  // Create new conversation - ALWAYS include workspace_id
  let customerName = `${channel.charAt(0).toUpperCase() + channel.slice(1)} User ${senderId.slice(0, 8)}`;
  
  try {
    const endpoint = channel === 'instagram' 
      ? `https://graph.instagram.com/${senderId}?fields=username&access_token=${accessToken}`
      : `https://graph.facebook.com/v21.0/${senderId}?fields=name&access_token=${accessToken}`;
    
    const userResponse = await fetch(endpoint);
    const userData = await userResponse.json();
    
    if (channel === 'instagram' && userData.username) {
      customerName = `@${userData.username}`;
    } else if (userData.name) {
      customerName = userData.name;
    }
  } catch (e) {
    console.log(`[AUTO-IMPORT] Could not fetch customer name for ${senderId}`);
  }

  const { data: newConv, error: createError } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      customer_name: customerName,
      customer_phone: senderId,
      channel: channel,
      thread_id: threadId,
      platform: channel,
      status: 'جديد',
      last_message_at: lastMessageTime,
      ai_enabled: false
    })
    .select('id')
    .single();

  if (createError) {
    // Handle duplicate key error
    if ((createError as any).code === '23505') {
      const { data: dupConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_phone', senderId)
        .eq('channel', channel)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      
      return dupConv?.id || null;
    }
    console.error(`[AUTO-IMPORT] Failed to create conversation:`, createError);
    return null;
  }

  console.log(`[AUTO-IMPORT] Created new conversation: ${newConv.id} in workspace: ${workspaceId}`);
  return newConv.id;
}
