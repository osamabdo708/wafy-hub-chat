import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
    document?: { file_id: string; file_name: string };
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ============================================
  // GET - Webhook verification / health check
  // ============================================
  if (req.method === 'GET') {
    console.log('[TELEGRAM-WEBHOOK] Health check request');
    return new Response(JSON.stringify({ status: 'ok', service: 'telegram-webhook' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // ============================================
  // POST - Incoming Telegram updates
  // ============================================
  if (req.method === 'POST') {
    try {
      const update: TelegramUpdate = await req.json();
      console.log('[TELEGRAM-WEBHOOK] Received update:', JSON.stringify(update, null, 2));

      // Only process message updates
      if (!update.message) {
        console.log('[TELEGRAM-WEBHOOK] No message in update, skipping');
        return new Response('OK', { status: 200 });
      }

      const message = update.message;
      const senderId = String(message.from.id);
      const chatId = String(message.chat.id);
      const messageId = String(message.message_id);
      const messageText = message.text || '[Media]';
      const timestamp = message.date * 1000;

      // Build customer name
      const firstName = message.from.first_name || '';
      const lastName = message.from.last_name || '';
      const username = message.from.username;
      let customerName = `${firstName} ${lastName}`.trim();
      if (!customerName && username) {
        customerName = `@${username}`;
      }
      if (!customerName) {
        customerName = `Telegram User ${senderId.slice(-8)}`;
      }

      console.log(`[TELEGRAM-WEBHOOK] Message from ${customerName} (${senderId}): ${messageText.substring(0, 50)}`);

      // Find all workspaces with Telegram integration
      const { data: integrations, error: intError } = await supabase
        .from('channel_integrations')
        .select('id, workspace_id, config, account_id')
        .eq('channel', 'telegram')
        .eq('is_connected', true);

      if (intError) {
        console.error('[TELEGRAM-WEBHOOK] Error fetching integrations:', intError);
        return new Response('OK', { status: 200 });
      }

      if (!integrations || integrations.length === 0) {
        console.log('[TELEGRAM-WEBHOOK] No Telegram integrations found');
        return new Response('OK', { status: 200 });
      }

      console.log(`[TELEGRAM-WEBHOOK] Found ${integrations.length} Telegram integration(s)`);

      // Process for each workspace
      for (const integration of integrations) {
        const workspaceId = integration.workspace_id;
        const config = integration.config as any;
        const botToken = config?.bot_token;
        
        console.log(`[TELEGRAM-WEBHOOK] Processing for workspace: ${workspaceId}`);

        // Try to get user profile photo
        let profilePicUrl: string | null = null;
        if (botToken) {
          try {
            const photosResponse = await fetch(
              `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${senderId}&limit=1`,
              { signal: AbortSignal.timeout(5000) }
            );

            if (photosResponse.ok) {
              const photosData = await photosResponse.json();
              console.log('[TELEGRAM-WEBHOOK] Profile photos response:', JSON.stringify(photosData));
              
              if (photosData.ok && photosData.result?.photos?.length > 0) {
                // Get the largest photo (last in the array)
                const photos = photosData.result.photos[0];
                const largestPhoto = photos[photos.length - 1];
                const fileId = largestPhoto?.file_id;
                
                if (fileId) {
                  // Get the file path
                  const fileResponse = await fetch(
                    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
                    { signal: AbortSignal.timeout(5000) }
                  );
                  
                  if (fileResponse.ok) {
                    const fileData = await fileResponse.json();
                    
                    if (fileData.ok && fileData.result?.file_path) {
                      profilePicUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
                      console.log('[TELEGRAM-WEBHOOK] Got profile pic URL:', profilePicUrl);
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.log('[TELEGRAM-WEBHOOK] Error fetching profile photo:', e);
          }
        }

        // Find or create conversation
        let { data: conversation } = await supabase
          .from('conversations')
          .select('id, customer_name, customer_avatar')
          .eq('customer_phone', chatId)
          .eq('channel', 'telegram')
          .eq('workspace_id', workspaceId)
          .maybeSingle();

        let conversationId: string;

        if (conversation) {
          conversationId = conversation.id;
          
          // Build update object
          const updateData: any = { 
            last_message_at: new Date(timestamp).toISOString() 
          };
          
          // Update name if it was generic
          const currentName = conversation.customer_name || '';
          const isGenericName = currentName.includes('Telegram User');
          if (isGenericName && customerName && !customerName.includes('Telegram User')) {
            updateData.customer_name = customerName;
          }
          
          // Update avatar if we have one and current is empty
          if (profilePicUrl && !conversation.customer_avatar) {
            updateData.customer_avatar = profilePicUrl;
            console.log('[TELEGRAM-WEBHOOK] Updating conversation with profile pic');
          }
          
          await supabase
            .from('conversations')
            .update(updateData)
            .eq('id', conversationId);
            
          console.log('[TELEGRAM-WEBHOOK] Updated existing conversation:', conversationId);
        } else {
          // Check workspace settings for default AI
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
            console.log('[TELEGRAM-WEBHOOK] Could not fetch workspace settings:', e);
          }

          // Create new conversation with avatar
          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert({
              workspace_id: workspaceId,
              customer_name: customerName,
              customer_phone: chatId,
              customer_avatar: profilePicUrl,
              channel: 'telegram',
              platform: 'telegram',
              thread_id: `telegram_${chatId}`,
              status: 'جديد',
              ai_enabled: defaultAiEnabled,
              assigned_agent_id: aiAgentId,
              last_message_at: new Date(timestamp).toISOString()
            })
            .select('id')
            .single();

          if (convError) {
            console.error('[TELEGRAM-WEBHOOK] Error creating conversation:', convError);
            continue;
          }

          conversationId = newConv.id;
          console.log('[TELEGRAM-WEBHOOK] Created new conversation:', conversationId, 'with avatar:', !!profilePicUrl);
        }

        // Check for duplicate message
        const { data: existingMsg } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('message_id', messageId)
          .maybeSingle();

        if (existingMsg) {
          console.log('[TELEGRAM-WEBHOOK] Message already exists, skipping:', messageId);
          continue;
        }

        // Insert message
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
            created_at: new Date(timestamp).toISOString()
          });

        if (msgError) {
          console.error('[TELEGRAM-WEBHOOK] Error saving message:', msgError);
          continue;
        }

        console.log('[TELEGRAM-WEBHOOK] ✅ Saved message:', messageId);

        // Trigger auto-reply if AI is enabled
        try {
          const { data: convData } = await supabase
            .from('conversations')
            .select('ai_enabled')
            .eq('id', conversationId)
            .single();

          if (convData?.ai_enabled) {
            console.log('[TELEGRAM-WEBHOOK] Triggering auto-reply for conversation:', conversationId);
            await supabase.functions.invoke('auto-reply', {
              body: { conversationId }
            });
          }
        } catch (e) {
          console.log('[TELEGRAM-WEBHOOK] Auto-reply trigger error (non-fatal):', e);
        }
      }

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('[TELEGRAM-WEBHOOK] Error:', error);
      return new Response('OK', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
