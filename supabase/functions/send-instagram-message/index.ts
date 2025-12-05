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

    const { recipientId, message } = await req.json();

    console.log('[SEND-INSTAGRAM] Sending message...', { recipientId, message: message?.substring(0, 50) });

    if (!recipientId || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing recipientId or message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get Instagram credentials from channel_integrations
    const { data: integration, error: integrationError } = await supabase
      .from('channel_integrations')
      .select('config')
      .eq('channel', 'instagram')
      .single();

    if (integrationError || !integration?.config) {
      console.error('[SEND-INSTAGRAM] Failed to get Instagram credentials:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Instagram not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const config = integration.config as any;
    const { page_access_token, instagram_account_id } = config;

    if (!page_access_token) {
      console.error('[SEND-INSTAGRAM] Missing page_access_token');
      return new Response(
        JSON.stringify({ error: 'Invalid Instagram configuration - missing token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[SEND-INSTAGRAM] Using Instagram Account ID:', instagram_account_id);

    // Send message via Instagram Graph API (uses the same endpoint as Facebook Messenger)
    // Instagram uses the page access token and sends to IGSID (Instagram Scoped User ID)
    const igApiUrl = `https://graph.facebook.com/v18.0/me/messages`;
    
    const igResponse = await fetch(igApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        access_token: page_access_token,
      }),
    });

    const igData = await igResponse.json();

    if (!igResponse.ok || igData.error) {
      console.error('[SEND-INSTAGRAM] API error:', igData);
      return new Response(
        JSON.stringify({ error: igData.error?.message || 'Failed to send Instagram message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[SEND-INSTAGRAM] Message sent successfully:', igData);

    return new Response(
      JSON.stringify({ success: true, messageId: igData.message_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SEND-INSTAGRAM] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
