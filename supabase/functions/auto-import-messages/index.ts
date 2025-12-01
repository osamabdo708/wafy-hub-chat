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
        let lastFetchTime = fbIntegration.last_fetch_timestamp 
          ? new Date(fbIntegration.last_fetch_timestamp)
          : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago for initial

        // Subtract 30 seconds buffer to avoid missing messages due to timing issues
        lastFetchTime = new Date(lastFetchTime.getTime() - 30000);

        console.log(`[FACEBOOK] Last fetch (with 30s buffer): ${lastFetchTime.toISOString()}`);
        
        // Fetch ALL conversations with increased limit
        // Remove folder parameter as it causes issues - get all conversations instead
        let conversationsUrl = `https://graph.facebook.com/v18.0/${page_id}/conversations?fields=id,senders,messages{id,message,from,created_time},unread_count,message_count&platform=messenger&limit=100&access_token=${page_access_token}`;
        
        console.log(`[FACEBOOK] Calling API for ALL messenger conversations`);
        
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
              const unreadCount = fbConv.unread_count || 0;
              const messageCount = fbConv.message_count || 0;
              
              console.log(`[FACEBOOK] Thread ${threadId}: unread=${unreadCount}, total_messages=${messageCount}, sender=${senderId}`);
              
              // Filter messages by timestamp - use >= to include messages at exact time
              const messages = allMessages.filter((msg: any) => {
                const msgTime = new Date(msg.created_time);
                return msgTime >= lastFetchTime;
              });
              
              console.log(`[FACEBOOK] Thread ${threadId}: ${messages.length} new messages (${allMessages.length} total)`);
              
              if (messages.length === 0) {
                console.log(`[FACEBOOK] Skipping thread ${threadId} - no new messages`);
                continue;
              }

              // Get or create conversation - search by customer_phone FIRST (most reliable)
              let { data: existingConv } = await supabase
                .from('conversations')
                .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                .eq('customer_phone', senderId)
                .eq('channel', 'facebook')
                .maybeSingle();

              // If not found by customer_phone, try thread_id
              if (!existingConv) {
                const { data: convByThread } = await supabase
                  .from('conversations')
                  .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                  .eq('thread_id', threadId)
                  .eq('channel', 'facebook')
                  .maybeSingle();
                
                existingConv = convByThread;
              }
              
              // Update thread_id if we found a conversation and thread_id is different
              if (existingConv && existingConv.thread_id !== threadId) {
                console.log(`[FACEBOOK] Updating thread_id for conversation ${existingConv.id} from ${existingConv.thread_id} to ${threadId}`);
                await supabase
                  .from('conversations')
                  .update({ thread_id: threadId })
                  .eq('id', existingConv.id);
                existingConv.thread_id = threadId;
              }

              console.log(`[FACEBOOK] Thread ${threadId}: Existing conversation: ${existingConv ? existingConv.id : 'none'}, will ${existingConv ? 'update' : 'create new'}`);

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
                // Create new conversation for new Facebook thread
                const userUrl = `https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${page_access_token}`;
                const userResponse = await fetch(userUrl);
                const userData = await userResponse.json();
                const customerName = userData.name || `Facebook User ${senderId.slice(0, 8)}`;
                
                console.log(`[FACEBOOK] Creating new conversation for sender ${senderId} (${customerName})`);
                
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
                  console.error(`[FACEBOOK] Failed to create conversation:`, createError);
                  continue;
                }
                
                conversationId = newConv.id;
                console.log(`[FACEBOOK] Created new conversation ${conversationId} for ${customerName}`);
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
      const { instagram_account_id, access_token } = config;

      if (instagram_account_id && access_token) {
        console.log(`[INSTAGRAM] Config - instagram_account_id: ${instagram_account_id}, has_token: ${!!access_token}`);
        
        let lastFetchTime = igIntegration.last_fetch_timestamp 
          ? new Date(igIntegration.last_fetch_timestamp)
          : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago for initial

        // Subtract 30 seconds buffer
        lastFetchTime = new Date(lastFetchTime.getTime() - 30000);

        console.log(`[INSTAGRAM] Last fetch (with 30s buffer): ${lastFetchTime.toISOString()}`);

        // Get the actual Instagram Business Account ID from the account
        console.log('[INSTAGRAM] Fetching Instagram Business Account details...');
        const accountUrl = `https://graph.instagram.com/${instagram_account_id}?fields=id,username,name&access_token=${access_token}`;
        const accountResponse = await fetch(accountUrl);
        
        let actualInstagramId = instagram_account_id; // Default to config value
        
        if (!accountResponse.ok) {
          const errorText = await accountResponse.text();
          console.error(`[INSTAGRAM] Account fetch failed: ${errorText}`);
        } else {
          const accountData = await accountResponse.json();
          console.log(`[INSTAGRAM] ✓ Account info: @${accountData.username || accountData.name} (ID: ${accountData.id})`);
          
          // Always use the ID from the API response as it's the authoritative source
          if (accountData.id) {
            actualInstagramId = accountData.id;
            if (accountData.id !== instagram_account_id) {
              console.log(`[INSTAGRAM] ⚠️ Config ID (${instagram_account_id}) differs from verified ID (${accountData.id}) - using verified ID`);
            }
          }
        }

        console.log(`[INSTAGRAM] Using Instagram Account ID: ${actualInstagramId}`);
        let conversationsUrl = `https://graph.instagram.com/${actualInstagramId}/conversations?fields=id,participants,messages{id,message,from,created_time}&platform=instagram&access_token=${access_token}`;
        
        console.log(`[INSTAGRAM] Calling API URL: ${conversationsUrl.replace(access_token, 'TOKEN_HIDDEN')}`);
        
        // Paginate through all conversations
        let conversationCount = 0;
        while (conversationsUrl) {
          const conversationsResponse = await fetch(conversationsUrl);
          
          console.log(`[INSTAGRAM] API Response Status: ${conversationsResponse.status} ${conversationsResponse.statusText}`);
          
          if (!conversationsResponse.ok) {
            const errorText = await conversationsResponse.text();
            console.error(`[INSTAGRAM] API error response: ${errorText}`);
            
            // Check for common errors with correct permission name
            if (conversationsResponse.status === 400) {
              console.error('[INSTAGRAM] Bad request - check if instagram_account_id is correct and token has instagram_business_manage_messages permission');
            } else if (conversationsResponse.status === 403) {
              console.error('[INSTAGRAM] Forbidden - token likely lacks instagram_business_manage_messages permission or account not connected to Facebook Page');
            }
            break;
          }
          
          const conversationsData = await conversationsResponse.json();
          console.log(`[INSTAGRAM] API Response Data:`, JSON.stringify(conversationsData, null, 2));
          
          conversationCount += conversationsData.data?.length || 0;
          console.log(`[INSTAGRAM] Received ${conversationsData.data?.length || 0} conversations (total so far: ${conversationCount})`);

          // If no conversations found, provide diagnostic info
          if (!conversationsData.data || conversationsData.data.length === 0) {
            console.log('[INSTAGRAM] ⚠️ No conversations found. Possible reasons:');
            console.log('  1. No Instagram Direct messages exist for this account yet');
            console.log('  2. Access token lacks "instagram_business_manage_messages" permission');
            console.log('  3. Instagram Business Account not properly linked to a Facebook Page');
            console.log('  4. Messages may be in "Message Requests" and not accepted yet');
            console.log(`  5. Account ID (${instagram_account_id}) may be incorrect - verify it's the Instagram Business Account ID`);
            console.log('  6. The Instagram account may need to accept at least one message first');
          }

          if (conversationsData.data) {
            for (const igConv of conversationsData.data) {
              const threadId = igConv.id;
              const senderId = igConv.participants?.data[0]?.id || 'unknown';
              const allMessages = igConv.messages?.data || [];
              
              console.log(`[INSTAGRAM] Thread ${threadId}: total_messages=${allMessages.length}, sender=${senderId}`);
              
              // Filter messages by timestamp - use >= to include messages at exact time
              const messages = allMessages.filter((msg: any) => {
                const msgTime = new Date(msg.created_time);
                return msgTime >= lastFetchTime;
              });
              
              console.log(`[INSTAGRAM] Thread ${threadId}: ${messages.length} new messages (${allMessages.length} total)`);
              
              if (messages.length === 0) {
                console.log(`[INSTAGRAM] Skipping thread ${threadId} - no new messages`);
                continue;
              }

              // Get existing conversation - search by customer_phone FIRST
              let { data: existingConv } = await supabase
                .from('conversations')
                .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                .eq('customer_phone', senderId)
                .eq('channel', 'instagram')
                .maybeSingle();

              // If not found by customer_phone, try thread_id
              if (!existingConv) {
                const { data: convByThread } = await supabase
                  .from('conversations')
                  .select('id, ai_enabled, thread_id, customer_name, customer_phone')
                  .eq('thread_id', threadId)
                  .eq('channel', 'instagram')
                  .maybeSingle();
                
                existingConv = convByThread;
              }
              
              // Update thread_id if we found a conversation and thread_id is different
              if (existingConv && existingConv.thread_id !== threadId) {
                console.log(`[INSTAGRAM] Updating thread_id for conversation ${existingConv.id} from ${existingConv.thread_id} to ${threadId}`);
                await supabase
                  .from('conversations')
                  .update({ thread_id: threadId })
                  .eq('id', existingConv.id);
                existingConv.thread_id = threadId;
              }

              console.log(`[INSTAGRAM] Thread ${threadId}: Existing conversation: ${existingConv ? existingConv.id : 'none'}, will ${existingConv ? 'update' : 'create new'}`);

              let conversationId;
              if (existingConv) {
                conversationId = existingConv.id;
                
                // Refresh customer name if it's a generic placeholder
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
                    console.log(`[INSTAGRAM] Updated customer name for conversation ${conversationId} to: ${userData.username}`);
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
                // Create new conversation for new Instagram thread
                const userUrl = `https://graph.instagram.com/${senderId}?fields=username&access_token=${access_token}`;
                const userResponse = await fetch(userUrl);
                const userData = await userResponse.json();
                const customerName = userData.username || `Instagram User ${senderId.slice(0, 8)}`;
                
                console.log(`[INSTAGRAM] Creating new conversation for sender ${senderId} (${customerName})`);
                
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
                  console.error(`[INSTAGRAM] Failed to create conversation:`, createError);
                  continue;
                }
                
                conversationId = newConv.id;
                console.log(`[INSTAGRAM] Created new conversation ${conversationId} for ${customerName}`);
              }

              // Import messages with deduplication by message_id
              for (const msg of messages.reverse()) {
                if (!msg || !msg.message || !msg.id) {
                  console.log(`[INSTAGRAM] Skipping invalid message in thread ${threadId}`);
                  continue;
                }

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
                  console.log(`[INSTAGRAM] Imported message ${msg.id} to conversation ${conversationId}`);
                } else {
                  console.error(`[INSTAGRAM] Failed to import message ${msg.id}:`, error);
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