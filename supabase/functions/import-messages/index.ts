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

    // Get all connected integrations
    const { data: integrations, error: intError } = await supabase
      .from('channel_integrations')
      .select('*')
      .eq('is_connected', true);

    if (intError) {
      console.error('Error fetching integrations:', intError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch integrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${integrations?.length || 0} connected integrations`);

    let totalImported = 0;

    for (const integration of integrations || []) {
      const config = integration.config as any;
      const channel = integration.channel;
      const workspaceId = integration.workspace_id;
      const lastFetch = integration.last_fetch_timestamp;

      console.log(`Processing ${channel} integration for workspace ${workspaceId}`);

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
            // WhatsApp is webhook-only, no polling import
            console.log('WhatsApp uses webhooks only, skipping import');
            break;
        }

        totalImported += imported;

        // Update last_fetch_timestamp
        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('id', integration.id);

      } catch (e) {
        console.error(`Error importing from ${channel}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, imported: totalImported }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// FACEBOOK IMPORT
// ============================================================================
async function importFacebookMessages(
  supabase: any,
  integration: any,
  config: any,
  lastFetch: string | null
): Promise<number> {
  const pageId = config.page_id;
  const accessToken = config.page_access_token;

  if (!pageId || !accessToken) {
    console.log('Missing Facebook config, skipping');
    return 0;
  }

  let imported = 0;

  try {
    // Fetch conversations
    const convsResponse = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/conversations?` +
      `fields=id,participants,updated_time&` +
      `access_token=${accessToken}`
    );
    const convsData = await convsResponse.json();

    if (!convsData.data) {
      console.log('No Facebook conversations found');
      return 0;
    }

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

      // Find or create conversation in database
      const dbConv = await getOrCreateConversation(
        supabase,
        integration.workspace_id,
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

        // Check for duplicate
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
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
    console.error('Facebook import error:', e);
  }

  console.log(`Imported ${imported} Facebook messages`);
  return imported;
}

// ============================================================================
// INSTAGRAM IMPORT
// ============================================================================
async function importInstagramMessages(
  supabase: any,
  integration: any,
  config: any,
  lastFetch: string | null
): Promise<number> {
  const instagramAccountId = config.instagram_account_id;
  const accessToken = config.page_access_token;

  if (!instagramAccountId || !accessToken) {
    console.log('Missing Instagram config, skipping');
    return 0;
  }

  let imported = 0;

  try {
    // Fetch conversations
    const convsResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramAccountId}/conversations?` +
      `fields=id,participants,updated_time&` +
      `access_token=${accessToken}`
    );
    const convsData = await convsResponse.json();

    if (!convsData.data) {
      console.log('No Instagram conversations found');
      return 0;
    }

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

      // Find or create conversation in database
      const dbConv = await getOrCreateConversation(
        supabase,
        integration.workspace_id,
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

        // Check for duplicate
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
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
    console.error('Instagram import error:', e);
  }

  console.log(`Imported ${imported} Instagram messages`);
  return imported;
}

// ============================================================================
// HELPER: Get or create conversation (workspace-scoped)
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
  // First try by customer_phone
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('channel', channel)
    .eq('customer_phone', customerId)
    .maybeSingle();

  if (existing) {
    if (existing.thread_id !== threadId) {
      await supabase
        .from('conversations')
        .update({ thread_id: threadId })
        .eq('id', existing.id);
    }
    return existing;
  }

  // Then try by thread_id
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
      name = data.name || data.username;
    } catch (e) {
      console.error('Error fetching customer name:', e);
    }
  }

  // Create new conversation
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
    console.error('Error creating conversation:', error);
    throw error;
  }

  return newConv;
}
