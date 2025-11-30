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

    console.log('[AUTO-IMPORT] Starting automated message import...');

    let totalImported = 0;

    // Determine if this is initial import (no messages exist yet)
    const { data: existingMessages, error: existingError } = await supabase
      .from('messages')
      .select('id')
      .limit(1);
    
    console.log(`[AUTO-IMPORT] Existing messages check: ${existingMessages?.length || 0} messages, error: ${existingError?.message || 'none'}`);
    
    const isInitialImport = !existingMessages || existingMessages.length === 0;
    console.log(`[AUTO-IMPORT] Is initial import: ${isInitialImport}`);

    // Import Facebook Messages
    const { data: fbIntegration, error: fbError } = await supabase
      .from('channel_integrations')
      .select('config, last_fetch_timestamp')
      .eq('channel', 'facebook')
      .eq('is_connected', true)
      .single();

    console.log(`[FACEBOOK] Integration check - Found: ${!!fbIntegration}, Error: ${fbError?.message || 'none'}`);
    
    if (fbIntegration?.config) {
      const config = fbIntegration.config as any;
      const { page_id, page_access_token } = config;
      
      console.log(`[FACEBOOK] Config - page_id: ${page_id}, has_token: ${!!page_access_token}`);

      if (page_id && page_access_token) {
        console.log('[FACEBOOK] Fetching conversations...');
        
        // NOTE: Facebook API does NOT support 'since' parameter on conversations endpoint
        // We must fetch all conversations and filter messages by timestamp locally
        const lastFetchTime = fbIntegration.last_fetch_timestamp 
          ? new Date(fbIntegration.last_fetch_timestamp)
          : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago for initial

        console.log(`[FACEBOOK] Last fetch: ${lastFetchTime.toISOString()}`);
        
        // Fetch conversations WITHOUT since parameter (doesn't work)
        let conversationsUrl = `https://graph.facebook.com/v18.0/${page_id}/conversations?fields=id,senders,messages{id,message,from,created_time}&access_token=${page_access_token}`;
        
        console.log(`[FACEBOOK] Calling API (no since parameter due to Facebook API limitation)`);
        
        // Paginate through all conversations
        let conversationCount = 0;
        while (conversationsUrl) {
          const conversationsResponse = await fetch(conversationsUrl);
          
          if (!conversationsResponse.ok) {
            console.error(`[FACEBOOK] API error: ${conversationsResponse.status} ${conversationsResponse.statusText}`);
            const errorText = await conversationsResponse.text();
            console.error(`[FACEBOOK] Error details: ${errorText}`);
            break;
          }
          
          const conversationsData = await conversationsResponse.json();
          conversationCount += conversationsData.data?.length || 0;
          console.log(`[FACEBOOK] Received ${conversationsData.data?.length || 0} conversations (total so far: ${conversationCount})`);

          if (conversationsData.data) {
            for (const fbConv of conversationsData.data) {
              const threadId = fbConv.id;
              const senderId = fbConv.senders?.data[0]?.id || 'unknown';
              const allMessages = fbConv.messages?.data || [];
              
              // Filter messages by timestamp (only new messages since last fetch)
              const messages = allMessages.filter((msg: any) => {
                const msgTime = new Date(msg.created_time);
                return msgTime > lastFetchTime;
              });
              
              console.log(`[FACEBOOK] Thread ${threadId}: ${messages.length} new messages (${allMessages.length} total)`);
              
              if (messages.length === 0) {
                console.log(`[FACEBOOK] Skipping thread ${threadId} - no new messages`);
                continue;
              }

              // Get or create conversation - search by customer_phone first (unique per channel)
              let { data: existingConv } = await supabase
                .from('conversations')
                .select('id, ai_enabled, thread_id, customer_name')
                .eq('customer_phone', senderId)
                .eq('channel', 'facebook')
                .maybeSingle();

              // If conversation exists but thread_id is different, update it
              if (existingConv && existingConv.thread_id !== threadId) {
                console.log(`[FACEBOOK] Updating thread_id for conversation ${existingConv.id} from ${existingConv.thread_id} to ${threadId}`);
                await supabase
                  .from('conversations')
                  .update({ thread_id: threadId })
                  .eq('id', existingConv.id);
                existingConv.thread_id = threadId;
              }

              let conversationId;
              if (existingConv) {
                conversationId = existingConv.id;
                
                // Refresh customer name if it's a generic placeholder
                if (existingConv.customer_name && existingConv.customer_name.startsWith('Facebook User')) {
                  const userUrl = `https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${page_access_token}`;
                  const userResponse = await fetch(userUrl);
                  const userData = await userResponse.json();
                  
                  if (userData.name) {
                    await supabase
                      .from('conversations')
                      .update({ 
                        customer_name: userData.name,
                        last_message_at: messages[0].created_time 
                      })
                      .eq('id', conversationId);
                    console.log(`[FACEBOOK] Updated customer name for conversation ${conversationId} to: ${userData.name}`);
                  } else {
                    await supabase
                      .from('conversations')
                      .update({ last_message_at: messages[0].created_time })
                      .eq('id', conversationId);
                  }
                } else {
                  await supabase
                    .from('conversations')
                    .update({ last_message_at: messages[0].created_time })
                    .eq('id', conversationId);
                }
              } else {
                // Create new conversation - fetch customer name from API
                const userUrl = `https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${page_access_token}`;
                const userResponse = await fetch(userUrl);
                const userData = await userResponse.json();
                const customerName = userData.name || `Facebook User ${senderId.substring(0, 8)}`;

                console.log(`[FACEBOOK] Creating new conversation for ${customerName} (${senderId})`);

                const { data: newConv, error: insertError } = await supabase
                  .from('conversations')
                  .insert({
                    customer_name: customerName,
                    customer_phone: senderId,
                    channel: 'facebook',
                    platform: 'facebook',
                    thread_id: threadId,
                    status: 'جديد',
                    ai_enabled: false,
                    last_message_at: messages[0].created_time
                  })
                  .select()
                  .single();

                if (insertError || !newConv) {
                  console.error(`[FACEBOOK] Failed to create conversation for thread ${threadId}:`, insertError);
                  continue;
                }

                conversationId = newConv.id;
              }

              // Import messages with deduplication by message_id
              for (const msg of messages.reverse()) {
                if (!msg || !msg.message || !msg.id) {
                  console.log(`[FACEBOOK] Skipping invalid message in thread ${threadId}`);
                  continue;
                }

                // Check if message already exists
                const { data: existingMsg } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('message_id', msg.id)
                  .maybeSingle();

                if (existingMsg) {
                  console.log(`[FACEBOOK] Skipping duplicate message: ${msg.id}`);
                  continue;
                }

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

                if (!error) {
                  totalImported++;
                  console.log(`[FACEBOOK] Imported message ${msg.id} to conversation ${conversationId}`);
                } else {
                  console.error(`[FACEBOOK] Failed to import message ${msg.id}:`, error);
                }
              }
            }
          }

          // Check for next page
          conversationsUrl = conversationsData.paging?.next || null;
        }

        // Update last_fetch_timestamp
        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('channel', 'facebook')
          .eq('is_connected', true);
      }
    }

    // Import WhatsApp Messages
    const { data: waIntegration } = await supabase
      .from('channel_integrations')
      .select('config, last_fetch_timestamp')
      .eq('channel', 'whatsapp')
      .eq('is_connected', true)
      .single();

    if (waIntegration?.config) {
      console.log('[WHATSAPP] Fetching messages...');
      const config = waIntegration.config as any;
      const { phone_number_id, access_token } = config;

      if (phone_number_id && access_token) {
        // WhatsApp Cloud API doesn't support historical message fetching via API
        // Messages are only available through webhooks in real-time
        // For polling-based import, we rely on the conversation/message structure
        // being populated by direct database operations or initial setup
        console.log('[WHATSAPP] WhatsApp Cloud API only supports real-time webhook delivery');
        console.log('[WHATSAPP] Existing messages in database will be processed by AI if ai_enabled=true');
        
        // Update last_fetch_timestamp
        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('channel', 'whatsapp')
          .eq('is_connected', true);
      }
    }

    // Import Instagram Messages
    const { data: igIntegration } = await supabase
      .from('channel_integrations')
      .select('config, last_fetch_timestamp')
      .eq('channel', 'instagram')
      .eq('is_connected', true)
      .single();

    if (igIntegration?.config) {
      console.log('[INSTAGRAM] Fetching conversations...');
      const config = igIntegration.config as any;
      const { instagram_account_id, page_access_token } = config;

      if (instagram_account_id && page_access_token) {
        let sinceTimestamp = igIntegration.last_fetch_timestamp 
          ? new Date(igIntegration.last_fetch_timestamp).getTime() / 1000
          : (Date.now() - 24 * 60 * 60 * 1000) / 1000;

        let conversationsUrl = `https://graph.facebook.com/v18.0/${instagram_account_id}/conversations?fields=id,participants,messages{id,message,from,created_time}&platform=instagram&since=${sinceTimestamp}&access_token=${page_access_token}`;
        
        // Paginate through all conversations
        while (conversationsUrl) {
          const conversationsResponse = await fetch(conversationsUrl);
          const conversationsData = await conversationsResponse.json();

          if (conversationsData.data) {
            for (const igConv of conversationsData.data) {
              const threadId = igConv.id;
              const senderId = igConv.participants?.data[0]?.id || 'unknown';
              const messages = igConv.messages?.data || [];
              
              if (messages.length === 0) continue;

              // Get or create conversation using thread_id
              const { data: existingConv } = await supabase
                .from('conversations')
                .select('id, ai_enabled')
                .eq('thread_id', threadId)
                .eq('platform', 'instagram')
                .maybeSingle();

              let conversationId;
              if (existingConv) {
                conversationId = existingConv.id;
                await supabase
                  .from('conversations')
                  .update({ last_message_at: messages[0].created_time })
                  .eq('id', conversationId);
              } else {
                const userUrl = `https://graph.facebook.com/v18.0/${senderId}?fields=username&access_token=${page_access_token}`;
                const userResponse = await fetch(userUrl);
                const userData = await userResponse.json();
                const customerName = userData.username || `Instagram User ${senderId.substring(0, 8)}`;

                const { data: newConv } = await supabase
                  .from('conversations')
                  .insert({
                    customer_name: customerName,
                    customer_phone: senderId,
                    channel: 'instagram',
                    platform: 'instagram',
                    thread_id: threadId,
                    status: 'جديد',
                    ai_enabled: false,
                    last_message_at: messages[0].created_time
                  })
                  .select()
                  .single();

                conversationId = newConv.id;
              }

              // Import messages with deduplication by message_id
              for (const msg of messages.reverse()) {
                if (!msg.message || !msg.id) continue;

                // Check if message already exists
                const { data: existingMsg } = await supabase
                  .from('messages')
                  .select('id')
                  .eq('message_id', msg.id)
                  .maybeSingle();

                if (existingMsg) {
                  console.log(`[INSTAGRAM] Skipping duplicate message: ${msg.id}`);
                  continue;
                }

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

                if (!error) {
                  totalImported++;
                }
              }
            }
          }

          // Check for next page
          conversationsUrl = conversationsData.paging?.next || null;
        }

        // Update last_fetch_timestamp
        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('channel', 'instagram')
          .eq('is_connected', true);
      }
    }

    console.log(`[AUTO-IMPORT] Completed. Imported ${totalImported} new messages.`);

    // Trigger auto-reply only for new non-old messages
    if (totalImported > 0 && !isInitialImport) {
      console.log('[AUTO-IMPORT] Triggering auto-reply...');
      await supabase.functions.invoke('auto-reply-messages');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: totalImported 
      }),
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