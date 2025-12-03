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
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorReason = url.searchParams.get('error_reason');

  console.log('[OAUTH] Callback received:', { code: !!code, error, errorReason });

  const appId = Deno.env.get('FACEBOOK_APP_ID');
  const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const redirectUri = `${supabaseUrl}/functions/v1/facebook-oauth-callback`;

  // Get the frontend URL for redirect
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://a51f3e85-5894-4c7d-b0b7-17e504628820.lovableproject.com';

  if (error) {
    console.error('[OAUTH] Error from Facebook:', error, errorReason);
    return Response.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return Response.redirect(`${frontendUrl}/settings?error=no_code`);
  }

  try {
    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v17.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    
    console.log('[OAUTH] Exchanging code for token...');
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[OAUTH] Token exchange error:', tokenData.error);
      return Response.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(tokenData.error.message)}`);
    }

    const shortLivedToken = tokenData.access_token;
    console.log('[OAUTH] Got short-lived token');

    // Exchange for long-lived token
    const longTokenUrl = `https://graph.facebook.com/v17.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    
    const longTokenResponse = await fetch(longTokenUrl);
    const longTokenData = await longTokenResponse.json();

    if (longTokenData.error) {
      console.error('[OAUTH] Long-lived token error:', longTokenData.error);
      return Response.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(longTokenData.error.message)}`);
    }

    const longLivedToken = longTokenData.access_token;
    console.log('[OAUTH] Got long-lived token');

    // Get user's pages
    const pagesUrl = `https://graph.facebook.com/v17.0/me/accounts?access_token=${longLivedToken}`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('[OAUTH] Pages fetch error:', pagesData.error);
      return Response.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(pagesData.error.message)}`);
    }

    console.log('[OAUTH] Found pages:', pagesData.data?.length);

    if (!pagesData.data || pagesData.data.length === 0) {
      return Response.redirect(`${frontendUrl}/settings?error=no_pages_found`);
    }

    // Use the first page (or you could let user choose)
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;
    const pageId = page.id;
    const pageName = page.name;

    console.log('[OAUTH] Using page:', { pageId, pageName });

    // Subscribe to webhook events
    const subscribeUrl = `https://graph.facebook.com/v17.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins&access_token=${pageAccessToken}`;
    const subscribeResponse = await fetch(subscribeUrl, { method: 'POST' });
    const subscribeData = await subscribeResponse.json();
    
    console.log('[OAUTH] Webhook subscription:', subscribeData);

    // Save to Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const verifyToken = 'almared_webhook_' + Math.random().toString(36).substring(7);

    const { error: upsertError } = await supabase
      .from('channel_integrations')
      .upsert({
        channel: 'facebook',
        is_connected: true,
        config: {
          page_access_token: pageAccessToken,
          page_id: pageId,
          page_name: pageName,
          verify_token: verifyToken,
          connected_via: 'oauth',
          connected_at: new Date().toISOString()
        }
      }, { onConflict: 'channel' });

    if (upsertError) {
      console.error('[OAUTH] Database save error:', upsertError);
      return Response.redirect(`${frontendUrl}/settings?error=database_error`);
    }

    console.log('[OAUTH] Successfully saved connection');
    return Response.redirect(`${frontendUrl}/settings?success=facebook_connected&page=${encodeURIComponent(pageName)}`);

  } catch (error) {
    console.error('[OAUTH] Unexpected error:', error);
    return Response.redirect(`${frontendUrl}/settings?error=unexpected_error`);
  }
});
