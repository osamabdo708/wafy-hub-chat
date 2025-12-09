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

    // Fetch all connected integrations dynamically
    const { data: integrations, error: integrationsError } = await supabase
      .from('channel_integrations')
      .select('*')
      .eq('is_connected', true);

    if (integrationsError) {
      console.error('[AUTO-IMPORT] Error fetching integrations:', integrationsError);
      throw integrationsError;
    }

    console.log(`[AUTO-IMPORT] Found ${integrations?.length || 0} connected integrations`);
    
    if (!integrations || integrations.length === 0) {
      console.log('[AUTO-IMPORT] No connected integrations found. Please configure channel integrations in Settings.');
      return new Response(
        JSON.stringify({ success: true, imported: 0, message: 'No connected integrations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is initial import
    const { data: existingMessages } = await supabase
      .from('messages')
      .select('id')
      .limit(1);
    
    const isInitialImport = !existingMessages || existingMessages.length === 0;
    console.log(`[AUTO-IMPORT] Is initial import: ${isInitialImport}`);

    let totalImported = 0;

    // Process each connected integration dynamically
    for (const integration of integrations) {
      const channelName = integration.channel.toUpperCase();
      console.log(`\n[${channelName}] Processing integration...`);
      
      if (!integration.config) {
        console.log(`[${channelName}] Skipping - no configuration found`);
        continue;
      }

      const config = integration.config as any;

      // Process based on channel type
      if (integration.channel === 'facebook') {
        const { page_id, page_access_token } = config;
        
        if (!page_id || !page_access_token) {
          console.log(`[${channelName}] Skipping - missing credentials`);
          continue;
        }

        console.log(`[${channelName}] Config - page_id: ${page_id}`);

        // Use a more generous lookback window - at least 5 minutes back
        let lastFetchTime = integration.last_fetch_timestamp 
          ? new Date(integration.last_fetch_timestamp)
          : new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Add 5 minute buffer to avoid missing messages
        lastFetchTime = new Date(lastFetchTime.getTime() - 5 * 60 * 1000);
        console.log(`[${channelName}] Last fetch (with 5min buffer): ${lastFetchTime.toISOString()}`);
        
        // Use the exact endpoint format from the working Python code
        let conversationsUrl = `https://graph.facebook.com/v17.0/${page_id}/conversations?fields=id,participants,updated_time,messages{id,message,from,created_time}&limit=100&access_token=${page_access_token}`;
        
        let conversationCount = 0;
        while (conversationsUrl) {
          const conversationsResponse = await fetch(conversationsUrl);
          
          if (!conversationsResponse.ok) {
            const errorText = await conversationsResponse.text();
            console.error(`[${channelName}] API error: ${conversationsResponse.status} - ${errorText}`);
            break;
          }
          
          const conversationsData = await conversationsResponse.json();
          conversationCount += conversationsData.data?.length || 0;
          console.log(`[${channelName}] Received ${conversationsData.data?.length || 0} conversations (total: ${conversationCount})`);

          if (conversationsData.data) {
            for (const fbConv of conversationsData.data) {
              const threadId = fbConv.id;
              const participants = fbConv.participants?.data || [];
              const senderId = participants.find((p: any) => p.id !== page_id)?.id || 'unknown';
              const allMessages = fbConv.messages?.data || [];
              
              const messages = allMessages.filter((msg: any) => {
                const msgTime = new Date(msg.created_time);
                return msgTime >= lastFetchTime;
              });
              
              console.log(`[${channelName}] Thread ${threadId}: ${messages.length} new messages`);
              
              if (messages.length === 0) continue;

              // Get or create conversation
              let { data: existingConv } = await supabase
                .from('conversations')
                .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                .eq('customer_phone', senderId)
                .eq('channel', 'facebook')
                .maybeSingle();

              if (!existingConv) {
                const { data: convByThread } = await supabase
                  .from('conversations')
                  .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                  .eq('thread_id', threadId)
                  .eq('channel', 'facebook')
                  .maybeSingle();
                
                existingConv = convByThread;
              }
              
              if (existingConv && existingConv.thread_id !== threadId) {
                await supabase
                  .from('conversations')
                  .update({ thread_id: threadId })
                  .eq('id', existingConv.id);
                existingConv.thread_id = threadId;
              }

              let conversationId;
              if (existingConv) {
                conversationId = existingConv.id;
                
                await supabase
                  .from('conversations')
                  .update({ 
                    last_message_at: messages[0].created_time,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', conversationId);
              } else {
                const userUrl = `https://graph.facebook.com/v17.0/${senderId}?fields=name&access_token=${page_access_token}`;
                const userResponse = await fetch(userUrl);
                const userData = await userResponse.json();
                const customerName = userData.name || `Facebook User ${senderId.slice(0, 8)}`;
                
                const { data: newConv, error: createError } = await supabase
                  .from('conversations')
                  .insert({
                    customer_name: customerName,
                    customer_phone: senderId,
                    channel: 'facebook',
                    thread_id: threadId,
                    platform: 'facebook',
                    status: 'جديد',
                    last_message_at: messages[0].created_time,
                    ai_enabled: false
                  })
                  .select()
                  .single();
                
                if (createError) {
                  console.error(`[${channelName}] Failed to create conversation:`, createError);
                  continue;
                }
                
                conversationId = newConv.id;
              }

              // Import messages
              for (const msg of messages.reverse()) {
                if (!msg || !msg.message || !msg.id) continue;

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

                if (!error) {
                  totalImported++;
                }
              }
            }
          }

          conversationsUrl = conversationsData.paging?.next || null;
        }

        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('id', integration.id);

      } else if (integration.channel === 'instagram') {
        const { instagram_account_id, access_token, page_id } = config;
        
        if (!access_token) {
          console.log(`[${channelName}] Skipping - missing access token`);
          continue;
        }

        console.log(`[${channelName}] Config - account_id: ${instagram_account_id}, page_id: ${page_id}`);
        
        // Use a more generous lookback window - at least 5 minutes back
        let lastFetchTime = integration.last_fetch_timestamp 
          ? new Date(integration.last_fetch_timestamp)
          : new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Add 5 minute buffer to avoid missing messages
        lastFetchTime = new Date(lastFetchTime.getTime() - 5 * 60 * 1000);
        console.log(`[${channelName}] Last fetch (with 5min buffer): ${lastFetchTime.toISOString()}`);

        // Use Facebook Page inbox to fetch Instagram messages (more reliable)
        let conversationsUrl = page_id 
          ? `https://graph.facebook.com/v21.0/${page_id}/conversations?platform=instagram&fields=id,participants,messages{id,message,from,created_time}&access_token=${access_token}`
          : `https://graph.instagram.com/${instagram_account_id}/conversations?fields=id,participants,messages{id,message,from,created_time}&platform=instagram&access_token=${access_token}`;
        
        let conversationCount = 0;
        while (conversationsUrl) {
          const conversationsResponse = await fetch(conversationsUrl);
          
          if (!conversationsResponse.ok) {
            const errorText = await conversationsResponse.text();
            console.error(`[${channelName}] API error: ${errorText}`);
            
            if (conversationsResponse.status === 400) {
              console.error(`[${channelName}] Check account_id and instagram_business_manage_messages permission`);
            }
            break;
          }
          
          const conversationsData = await conversationsResponse.json();
          conversationCount += conversationsData.data?.length || 0;
          console.log(`[${channelName}] Received ${conversationsData.data?.length || 0} conversations`);

          if (!conversationsData.data || conversationsData.data.length === 0) {
            console.log(`[${channelName}] No conversations found - check permissions or accept message requests`);
          }

          if (conversationsData.data) {
            for (const igConv of conversationsData.data) {
              const threadId = igConv.id;
              const senderId = igConv.participants?.data[0]?.id || 'unknown';
              const allMessages = igConv.messages?.data || [];
              
              const messages = allMessages.filter((msg: any) => {
                const msgTime = new Date(msg.created_time);
                return msgTime >= lastFetchTime;
              });
              
              console.log(`[${channelName}] Thread ${threadId}: ${messages.length} new messages`);
              
              if (messages.length === 0) continue;

              // Get or create conversation
              let { data: existingConv } = await supabase
                .from('conversations')
                .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                .eq('customer_phone', senderId)
                .eq('channel', 'instagram')
                .maybeSingle();

              if (!existingConv) {
                const { data: convByThread } = await supabase
                  .from('conversations')
                  .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                  .eq('thread_id', threadId)
                  .eq('channel', 'instagram')
                  .maybeSingle();
                
                existingConv = convByThread;
              }
              
              if (existingConv && existingConv.thread_id !== threadId) {
                await supabase
                  .from('conversations')
                  .update({ thread_id: threadId })
                  .eq('id', existingConv.id);
                existingConv.thread_id = threadId;
              }

              let conversationId;
              if (existingConv) {
                conversationId = existingConv.id;
                
                if (existingConv.customer_name && existingConv.customer_name.startsWith('Instagram User')) {
                  const userUrl = `https://graph.instagram.com/${senderId}?fields=username&access_token=${access_token}`;
                  const userResponse = await fetch(userUrl);
                  const userData = await userResponse.json();
                  
                  if (userData.username) {
                    await supabase
                      .from('conversations')
                      .update({ 
                        customer_name: userData.username,
                        last_message_at: messages[0].created_time 
                      })
                      .eq('id', conversationId);
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
                const userUrl = `https://graph.instagram.com/${senderId}?fields=username&access_token=${access_token}`;
                const userResponse = await fetch(userUrl);
                const userData = await userResponse.json();
                const customerName = userData.username || `Instagram User ${senderId.slice(0, 8)}`;
                
                const { data: newConv, error: createError } = await supabase
                  .from('conversations')
                  .insert({
                    customer_name: customerName,
                    customer_phone: senderId,
                    channel: 'instagram',
                    thread_id: threadId,
                    platform: 'instagram',
                    status: 'جديد',
                    last_message_at: messages[0].created_time,
                    ai_enabled: false
                  })
                  .select()
                  .single();
                
                if (createError) {
                  console.error(`[${channelName}] Failed to create conversation:`, createError);
                  continue;
                }
                
                conversationId = newConv.id;
              }

              // Import messages
              for (const msg of messages.reverse()) {
                if (!msg || !msg.message || !msg.id) continue;

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

                if (!error) {
                  totalImported++;
                }
              }
            }
          }

          conversationsUrl = conversationsData.paging?.next || null;
        }

        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('id', integration.id);

      } else if (integration.channel === 'whatsapp') {
        console.log(`[${channelName}] WhatsApp Cloud API only supports real-time webhook delivery`);
        
        await supabase
          .from('channel_integrations')
          .update({ last_fetch_timestamp: new Date().toISOString() })
          .eq('id', integration.id);

      } else {
        console.log(`[${channelName}] Channel not yet implemented for polling`);
      }
    }

    console.log(`\n[AUTO-IMPORT] Completed. Imported ${totalImported} new messages.`);

    // Trigger auto-reply for new messages
    if (totalImported > 0 && !isInitialImport) {
      console.log('[AUTO-IMPORT] Triggering auto-reply...');
      await supabase.functions.invoke('auto-reply-messages');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: totalImported,
        processed_channels: integrations.map(i => i.channel)
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
