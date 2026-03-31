import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { access_token, instagram_account_id } = await req.json();

    console.log('Testing Instagram connection...');

    // Try Instagram Graph API first (for tokens from Instagram app)
    const meResponse = await fetch(
      `https://graph.instagram.com/me?fields=user_id,username,name,account_type&access_token=${access_token}`
    );
    const meData = await meResponse.json();

    if (meResponse.ok && !meData.error) {
      console.log('Instagram API connection successful:', meData);
      return new Response(
        JSON.stringify({
          success: true,
          account: meData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback: try Facebook Graph API (for tokens from Meta app)
    if (instagram_account_id) {
      const accountResponse = await fetch(
        `https://graph.facebook.com/v22.0/${instagram_account_id}?fields=id,username,name,account_type&access_token=${access_token}`
      );
      const accountData = await accountResponse.json();

      if (accountResponse.ok && !accountData.error) {
        console.log('Facebook Graph API connection successful:', accountData);
        return new Response(
          JSON.stringify({ success: true, account: accountData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('Both APIs failed:', meData, accountData);
      return new Response(
        JSON.stringify({
          success: false,
          error: accountData.error?.message || meData.error?.message || 'Failed to connect',
          details: { instagram_api: meData, facebook_api: accountData }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.error('Instagram API error:', meData);
    return new Response(
      JSON.stringify({
        success: false,
        error: meData.error?.message || 'Failed to connect to Instagram',
        details: meData
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing Instagram connection:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
