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

  const url = new URL(req.url);

  // Handle webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[WHATSAPP-WEBHOOK] Verification request:', { mode, token, challenge });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // To support multiple independent WhatsApp connections, we need to find the
    // correct integration based on the verify_token, which should be unique per connection.
    // Since the verify_token is not passed in the URL for the GET request, we will
    // have to query all connected WhatsApp channels and check the token.
    // For now, we will assume a single connection and use the default token,
    // but this is a point of failure for multiple connections.
    // The proper fix would be to include a unique identifier in the webhook URL.

    // Fallback to a single integration check for now.
    const { data: integrations } = await supabase
      .from('channel_integrations')
      .select('config')
      .like('channel', 'whatsapp%');

    let integration: any = null;
    let verifyToken = 'almared_whatsapp_webhook'; // Default fallback

    if (integrations && integrations.length > 0) {
      for (const int of integrations) {
        const token = (int.config as any)?.verify_token;
        if (token && token === url.searchParams.get('hub.verify_token')) {
          integration = int;
          verifyToken = token;
          break;
        }
      }
      // If no match, use the first one as a fallback for the challenge response
      if (!integration) {
        integration = integrations[0];
        verifyToken = (integration.config as any)?.verify_token || verifyToken;
      }
    }

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WHATSAPP-WEBHOOK] Verification successful');
      return new Response(challenge, { status: 200 });
    } else {
      console.log('[WHATSAPP-WEBHOOK] Verification failed');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // Handle incoming messages (POST request from Meta)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[WHATSAPP-WEBHOOK] Received payload:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // To support multiple independent WhatsApp connections, we need to find the
      // correct integration based on the `wa_id` (WhatsApp Business Account ID)
      // or `phone_number_id` from the incoming payload.
      const waId = body.entry?.[0]?.id; // This is the WhatsApp Business Account ID

      if (!waId) {
        console.log('[WHATSAPP-WEBHOOK] Missing WhatsApp Business Account ID in payload');
        return new Response('OK', { status: 200 });
      }

      const { data: integrations } = await supabase
        .from('channel_integrations')
        .select('config, workspace_id')
        .like('channel', 'whatsapp%');

      let integration: any = null;
      let workspaceId: string | null = null;

      if (integrations && integrations.length > 0) {
        for (const int of integrations) {
          if ((int.config as any)?.wa_id === waId) {
            integration = int;
            workspaceId = int.workspace_id;
            break;
          }
        }
      }

      if (!integration) {
        console.log(`[WHATSAPP-WEBHOOK] No WhatsApp integration found for WA ID: ${waId}`);
        return new Response('OK', { status: 200 });
      }

      const config = integration.config as any;

      // WhatsApp Cloud API message structure
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'messages') continue;
          
          const value = change.value;
          const messages = value.messages || [];
          
          for (const message of messages) {
            const senderId = message.from;
            const messageText = message.text?.body;
            const messageId = message.id;
            const timestamp = message.timestamp;

            if (!messageText) continue;

            console.log('[WHATSAPP-WEBHOOK] Processing message:', { senderId, messageText, messageId });

            let conversationId: string;
            const threadId = `wa_${senderId}`;

            // Extract profile information from contacts array
            const contacts = value.contacts || [];
            let customerName = `WhatsApp User ${senderId.slice(-8)}`;
            let profilePicUrl: string | null = null;
            
            if (contacts.length > 0) {
              const contact = contacts[0];
              if (contact.profile?.name) {
                customerName = contact.profile.name;
              }
              // Check if profile picture is available in the contact data
              // Note: WhatsApp webhook includes profile picture URL if user has set their profile picture
              // and privacy settings allow it. The API doesn't provide a separate endpoint to fetch user profile pictures.
              if (contact.profile?.picture_url) {
                profilePicUrl = contact.profile.picture_url;
                console.log('[WHATSAPP-WEBHOOK] Found profile picture in webhook payload');
              }
            }

            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id, customer_name, customer_avatar')
              .eq('customer_phone', senderId)
              .eq('channel', 'whatsapp')
              .eq('workspace_id', workspaceId) // Filter by workspace_id
              .single();

            if (existingConv) {
              conversationId = existingConv.id;
              
              // Build update object
              const updateData: any = { 
                last_message_at: new Date(parseInt(timestamp) * 1000).toISOString(),
                thread_id: threadId
              };
              
              // Update name if it was generic
              const currentName = existingConv.customer_name || '';
              const isGenericName = currentName.includes('WhatsApp User');
              if (isGenericName && customerName && !customerName.includes('WhatsApp User')) {
                updateData.customer_name = customerName;
              }
              
              // Update avatar if we have one and current is empty
              if (profilePicUrl && !existingConv.customer_avatar) {
                updateData.customer_avatar = profilePicUrl;
                console.log('[WHATSAPP-WEBHOOK] Updating conversation with profile picture');
              }
              
              await supabase
                .from('conversations')
                .update(updateData)
                .eq('id', conversationId);
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
                console.log('[WHATSAPP-WEBHOOK] Could not fetch workspace settings:', e);
              }

              const { data: newConv, error: convError } = await supabase
                .from('conversations')
                .insert({
                  customer_name: customerName,
                  customer_phone: senderId,
                  customer_avatar: profilePicUrl,
                  channel: 'whatsapp',
                  platform: 'whatsapp',
                  thread_id: threadId,
                  status: 'جديد',
                  ai_enabled: defaultAiEnabled,
                  assigned_agent_id: aiAgentId,
                  workspace_id: workspaceId,
                  last_message_at: new Date(parseInt(timestamp) * 1000).toISOString()
                })
                .select('id')
                .single();

              if (convError) {
                console.error('[WHATSAPP-WEBHOOK] Error creating conversation:', convError);
                continue;
              }
              conversationId = newConv.id;
            }

            const { data: existingMsg } = await supabase
              .from('messages')
              .select('id')
              .eq('message_id', messageId)
              .single();

            if (existingMsg) {
              console.log('[WHATSAPP-WEBHOOK] Message already exists, skipping');
              continue;
            }

            const { error: msgError } = await supabase
              .from('messages')
              .insert({
                conversation_id: conversationId,
                content: messageText,
                sender_type: 'customer',
                message_id: messageId,
                is_old: false,
                reply_sent: false,
                is_read: false,
                created_at: new Date(parseInt(timestamp) * 1000).toISOString()
              });

            if (msgError) {
              console.error('[WHATSAPP-WEBHOOK] Error inserting message:', msgError);
            } else {
              console.log('[WHATSAPP-WEBHOOK] Message saved successfully');
              try {
                await supabase.functions.invoke('auto-reply-messages');
              } catch (e) {
                console.log('[WHATSAPP-WEBHOOK] Auto-reply trigger failed:', e);
              }
            }
          }
        }
      }

      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('[WHATSAPP-WEBHOOK] Error processing webhook:', error);
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
