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
    const { botToken, action, webhookUrl } = await req.json();
    
    console.log('[TEST-TELEGRAM] Action:', action);

    if (!botToken) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Bot token is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const baseUrl = `https://api.telegram.org/bot${botToken}`;

    // ============================================
    // Get bot info (test connection)
    // ============================================
    if (action === 'getMe' || action === 'test') {
      console.log('[TEST-TELEGRAM] Testing bot connection...');
      
      const response = await fetch(`${baseUrl}/getMe`);
      const data = await response.json();
      
      console.log('[TEST-TELEGRAM] getMe response:', JSON.stringify(data));
      
      if (data.ok) {
        return new Response(JSON.stringify({ 
          success: true,
          bot: {
            id: data.result.id,
            username: data.result.username,
            first_name: data.result.first_name,
            can_join_groups: data.result.can_join_groups,
            can_read_all_group_messages: data.result.can_read_all_group_messages,
            supports_inline_queries: data.result.supports_inline_queries
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.description || 'Failed to connect to Telegram'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // Set webhook
    // ============================================
    if (action === 'setWebhook') {
      if (!webhookUrl) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Webhook URL is required' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('[TEST-TELEGRAM] Setting webhook to:', webhookUrl);
      
      const response = await fetch(`${baseUrl}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query']
        })
      });
      
      const data = await response.json();
      console.log('[TEST-TELEGRAM] setWebhook response:', JSON.stringify(data));
      
      if (data.ok) {
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Webhook set successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.description || 'Failed to set webhook'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // Get webhook info
    // ============================================
    if (action === 'getWebhookInfo') {
      console.log('[TEST-TELEGRAM] Getting webhook info...');
      
      const response = await fetch(`${baseUrl}/getWebhookInfo`);
      const data = await response.json();
      
      console.log('[TEST-TELEGRAM] getWebhookInfo response:', JSON.stringify(data));
      
      if (data.ok) {
        return new Response(JSON.stringify({ 
          success: true,
          webhook: {
            url: data.result.url,
            has_custom_certificate: data.result.has_custom_certificate,
            pending_update_count: data.result.pending_update_count,
            last_error_date: data.result.last_error_date,
            last_error_message: data.result.last_error_message,
            max_connections: data.result.max_connections
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.description || 'Failed to get webhook info'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // Delete webhook
    // ============================================
    if (action === 'deleteWebhook') {
      console.log('[TEST-TELEGRAM] Deleting webhook...');
      
      const response = await fetch(`${baseUrl}/deleteWebhook`);
      const data = await response.json();
      
      console.log('[TEST-TELEGRAM] deleteWebhook response:', JSON.stringify(data));
      
      if (data.ok) {
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Webhook deleted successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.description || 'Failed to delete webhook'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================
    // Send test message
    // ============================================
    if (action === 'sendTest') {
      const { chatId, message } = await req.json();
      
      if (!chatId) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Chat ID is required for sending test message' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('[TEST-TELEGRAM] Sending test message to:', chatId);
      
      const response = await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message || '✅ Test message from Genie CRM'
        })
      });
      
      const data = await response.json();
      console.log('[TEST-TELEGRAM] sendMessage response:', JSON.stringify(data));
      
      if (data.ok) {
        return new Response(JSON.stringify({ 
          success: true,
          message_id: data.result.message_id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: data.description || 'Failed to send message'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Unknown action' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[TEST-TELEGRAM] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
