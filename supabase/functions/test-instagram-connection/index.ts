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

    // Test: Get Instagram account info
    const accountResponse = await fetch(
      `https://graph.instagram.com/${instagram_account_id}?fields=id,username,account_type&access_token=${access_token}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );

    const accountData = await accountResponse.json();

    if (!accountResponse.ok) {
      console.error('Instagram API error:', accountData);
      return new Response(
        JSON.stringify({
          success: false,
          error: accountData.error?.message || 'Failed to connect',
          error_code: accountData.error?.code,
          error_type: accountData.error?.type,
          details: accountData
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Connection successful:', accountData);

    return new Response(
      JSON.stringify({
        success: true,
        account: accountData
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error testing Instagram connection:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
