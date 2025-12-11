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

    // Get ALL connected integrations across ALL workspaces
    const { data: integrations, error: intError } = await supabase
      .from('channel_integrations')
      .select('*')
      .eq('is_connected', true);

    if (intError) {
      console.error('[IMPORT] Error fetching integrations:', intError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch integrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[IMPORT] Found ${integrations?.length || 0} connected integrations across all workspaces`);

    // Group integrations by workspace for logging
    const workspaceCount = new Set(integrations?.map(i => i.workspace_id)).size;
    console.log(`[IMPORT] Processing integrations for ${workspaceCount} different workspaces`);

    let totalImported = 0;
    const results: { workspace: string; channel: string; imported: number }[] = [];

    // Process EACH integration independently - true multi-tenant processing
    for (const integration of integrations || []) {
      const config = integration.config as any;
      const channel = integration.channel;
      const workspaceId = integration.workspace_id;
      const lastFetch = integration.last_fetch_timestamp;

      console.log(`[IMPORT] Processing ${channel} for workspace ${workspaceId}`);

      try {
        let imported = 0;

        switch (channel) {
          case 'facebook':
            imported = await importFacebookMessages(supabase, integration, config, lastFetch);
            break;
          case 'instagram':
            imported = await importInstagramMessages(supabase, integration, config, lastFetch);
            break;
          case 'whatsapp':
            // WhatsApp is webhook-only, no polling import needed
            console.log(`[IMPORT] WhatsApp uses webhooks only, skipping polling import`);
            break;
        }

        totalImported += imported;
        results.push({ workspace: workspaceId, channel, imported });

        // Update last_fetch_timestamp for THIS specific integration
        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('id', integration.id);

        console.log(`[IMPORT] ✅ Workspace ${workspaceId} - ${channel}: imported ${imported} messages`);

      } catch (e) {
        console.error(`[IMPORT] Error importing ${channel} for workspace ${workspaceId}:`, e);
        results.push({ workspace: workspaceId, channel, imported: 0 });
      }
    }

    console.log(`[IMPORT] Complete. Total imported: ${totalImported} messages across ${workspaceCount} workspaces`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalImported,
        workspaceCount,
        details: results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[IMPORT] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// FACEBOOK IMPORT (WORKSPACE-SCOPED)
// ============================================================================
async function importFacebookMessages(
  supabase: any,
  integration: any,
  config: any,
  lastFetch: string | null
): Promise<number> {
  const pageId = config.page_id;
  const accessToken = config.page_access_token;
  const workspaceId = integration.workspace_id;

  if (!pageId || !accessToken) {
    console.log(`[IMPORT] Missing Facebook config for workspace ${workspaceId}, skipping`);
    return 0;
  }

  let imported = 0;

  try {
    // Fetch conversations from Facebook API
    const convsResponse = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/conversations?` +
      `fields=id,participants,updated_time&` +
      `access_token=${accessToken}`
    );
    const convsData = await convsResponse.json();

    if (!convsData.data) {
      console.log(`[IMPORT] No Facebook conversations found for workspace ${workspaceId}`);
      return 0;
    }

    console.log(`[IMPORT] Found ${convsData.data.length} Facebook conversations for workspace ${workspaceId}`);

    for (const conv of convsData.data) {
      // Skip if not updated since last fetch
      if (lastFetch && new Date(conv.updated_time) <= new Date(lastFetch)) {
        continue;
      }

      // Get messages for this conversation
      const msgsResponse = await fetch(
        `https://graph.facebook.com/v21.0/${conv.id}?` +
        `fields=messages{id,message,from,created_time}&` +
        `access_token=${accessToken}`
      );
      const msgsData = await msgsResponse.json();

      if (!msgsData.messages?.data) continue;

      // Find customer participant
      const customer = conv.participants?.data?.find((p: any) => p.id !== pageId);
      const customerId = customer?.id || conv.id;

      // Find or create conversation in THIS workspace's database
      const dbConv = await getOrCreateConversation(
        supabase,
        workspaceId,
        'facebook',
        customerId,
        conv.id,
        customer?.name,
        accessToken
      );

      for (const msg of msgsData.messages.data) {
        // Skip if not after last fetch
        if (lastFetch && new Date(msg.created_time) <= new Date(lastFetch)) {
          continue;
        }

        // Skip our own messages
        if (msg.from?.id === pageId) continue;

        // Check for duplicate - SCOPED BY CONVERSATION (workspace-isolated)
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', dbConv.id)
          .eq('message_id', msg.id)
          .maybeSingle();

        if (existing) continue;

        // Save message
        await supabase.from('messages').insert({
          conversation_id: dbConv.id,
          content: msg.message || '[Attachment]',
          sender_type: 'customer',
          message_id: msg.id,
          is_old: true,
          reply_sent: true, // Mark old messages as already replied
          created_at: new Date(msg.created_time).toISOString(),
        });

        imported++;
      }

      // Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date(conv.updated_time).toISOString() })
        .eq('id', dbConv.id);
    }
  } catch (e) {
    console.error(`[IMPORT] Facebook import error for workspace ${workspaceId}:`, e);
  }

  console.log(`[IMPORT] Imported ${imported} Facebook messages for workspace ${workspaceId}`);
  return imported;
}

// ============================================================================
// INSTAGRAM IMPORT (WORKSPACE-SCOPED)
// ============================================================================
async function importInstagramMessages(
  supabase: any,
  integration: any,
  config: any,
  lastFetch: string | null
): Promise<number> {
  const instagramAccountId = config.instagram_account_id;
  const accessToken = config.page_access_token;
  const workspaceId = integration.workspace_id;

  if (!instagramAccountId || !accessToken) {
    console.log(`[IMPORT] Missing Instagram config for workspace ${workspaceId}, skipping`);
    return 0;
  }

  let imported = 0;

  try {
    // Fetch conversations from Instagram API
    const convsResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramAccountId}/conversations?` +
      `fields=id,participants,updated_time&` +
      `access_token=${accessToken}`
    );
    const convsData = await convsResponse.json();

    if (!convsData.data) {
      console.log(`[IMPORT] No Instagram conversations found for workspace ${workspaceId}`);
      return 0;
    }

    console.log(`[IMPORT] Found ${convsData.data.length} Instagram conversations for workspace ${workspaceId}`);

    for (const conv of convsData.data) {
      // Skip if not updated since last fetch
      if (lastFetch && new Date(conv.updated_time) <= new Date(lastFetch)) {
        continue;
      }

      // Get messages for this conversation
      const msgsResponse = await fetch(
        `https://graph.facebook.com/v21.0/${conv.id}?` +
        `fields=messages{id,message,from,created_time}&` +
        `access_token=${accessToken}`
      );
      const msgsData = await msgsResponse.json();

      if (!msgsData.messages?.data) continue;

      // Find customer participant
      const customer = conv.participants?.data?.find((p: any) => p.id !== instagramAccountId);
      const customerId = customer?.id || conv.id;

      // Find or create conversation in THIS workspace's database
      const dbConv = await getOrCreateConversation(
        supabase,
        workspaceId,
        'instagram',
        customerId,
        conv.id,
        customer?.username || customer?.name,
        accessToken
      );

      for (const msg of msgsData.messages.data) {
        // Skip if not after last fetch
        if (lastFetch && new Date(msg.created_time) <= new Date(lastFetch)) {
          continue;
        }

        // Skip our own messages
        if (msg.from?.id === instagramAccountId) continue;

        // Check for duplicate - SCOPED BY CONVERSATION (workspace-isolated)
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', dbConv.id)
          .eq('message_id', msg.id)
          .maybeSingle();

        if (existing) continue;

        // Save message
        await supabase.from('messages').insert({
          conversation_id: dbConv.id,
          content: msg.message || '[Attachment]',
          sender_type: 'customer',
          message_id: msg.id,
          is_old: true,
          reply_sent: true,
          created_at: new Date(msg.created_time).toISOString(),
        });

        imported++;
      }

      // Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date(conv.updated_time).toISOString() })
        .eq('id', dbConv.id);
    }
  } catch (e) {
    console.error(`[IMPORT] Instagram import error for workspace ${workspaceId}:`, e);
  }

  console.log(`[IMPORT] Imported ${imported} Instagram messages for workspace ${workspaceId}`);
  return imported;
}

// ============================================================================
// HELPER: Get or create conversation (STRICTLY workspace-scoped)
// ============================================================================
async function getOrCreateConversation(
  supabase: any,
  workspaceId: string,
  channel: string,
  customerId: string,
  threadId: string,
  customerName: string | null,
  accessToken: string
) {
  // First try by customer_phone + channel + workspace_id
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('channel', channel)
    .eq('customer_phone', customerId)
    .maybeSingle();

  if (existing) {
    // Update thread_id if changed
    if (existing.thread_id !== threadId) {
      await supabase
        .from('conversations')
        .update({ thread_id: threadId })
        .eq('id', existing.id);
    }
    return existing;
  }

  // Then try by thread_id + workspace_id
  const { data: byThread } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('channel', channel)
    .eq('thread_id', threadId)
    .maybeSingle();

  if (byThread) return byThread;

  // Fetch customer name if not provided
  let name = customerName;
  if (!name) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${customerId}?fields=name,username&access_token=${accessToken}`
      );
      const data = await response.json();
      if (channel === 'instagram' && data.username) {
        name = `@${data.username}`;
      } else if (data.name) {
        name = data.name;
      }
    } catch (e) {
      console.error('[IMPORT] Error fetching customer name:', e);
    }
  }

  // Create new conversation IN THIS WORKSPACE
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      channel,
      customer_phone: customerId,
      customer_name: name || `Customer ${customerId.slice(-4)}`,
      thread_id: threadId,
      status: 'جديد',
      ai_enabled: false,
    })
    .select()
    .single();

  if (error) {
    // Handle duplicate - might have been created by webhook
    if ((error as any).code === '23505') {
      const { data: dupConv } = await supabase
        .from('conversations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('channel', channel)
        .eq('customer_phone', customerId)
        .maybeSingle();
      if (dupConv) return dupConv;
    }
    console.error('[IMPORT] Error creating conversation:', error);
    throw error;
  }

  console.log(`[IMPORT] Created new conversation ${newConv.id} in workspace ${workspaceId}`);
  return newConv;
}
