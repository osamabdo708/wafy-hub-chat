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

    console.log('Sending message to Facebook...', { recipientId, message });

    if (!recipientId || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing recipientId or message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get Facebook credentials - find a connected integration
    const { data: integrations, error: integrationError } = await supabase
      .from('channel_integrations')
      .select('config, account_id')
      .eq('channel', 'facebook')
      .eq('is_connected', true);

    if (integrationError || !integrations || integrations.length === 0) {
      console.error('Failed to get Facebook credentials:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Facebook not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Use the first connected integration
    const integration = integrations[0];

    const config = integration.config as any;
    const { page_access_token } = config;

    if (!page_access_token) {
      console.error('Missing page_access_token');
      return new Response(
        JSON.stringify({ error: 'Invalid Facebook configuration' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Send message via Facebook Graph API
    const fbApiUrl = `https://graph.facebook.com/v18.0/me/messages`;
    
    const fbResponse = await fetch(fbApiUrl, {
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

    const fbData = await fbResponse.json();

    if (!fbResponse.ok || fbData.error) {
      console.error('Facebook API error:', fbData);
      return new Response(
        JSON.stringify({ error: fbData.error?.message || 'Failed to send message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Message sent successfully:', fbData);

    // Return message_id so frontend can save it to prevent duplicate imports
    return new Response(
      JSON.stringify({ success: true, messageId: fbData.message_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send message function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
