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
  const state = url.searchParams.get('state');

  const appId = Deno.env.get('FACEBOOK_APP_ID');
  const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const redirectUri = `${supabaseUrl}/functions/v1/facebook-oauth-callback`;

  const frontendUrl = Deno.env.get('FRONTEND_URL');

  if (error) {
    return Response.redirect(
      `${frontendUrl}/settings?error=${encodeURIComponent(error)}&channel=${state}`
    );
  }

  if (!code) {
    return Response.redirect(`${frontendUrl}/settings?error=no_code`);
  }

  try {
    // 1️⃣ Exchange code → short-lived token
    const tokenUrl = `https://graph.facebook.com/v17.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&client_secret=${appSecret}&code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(tokenData.error.message)}`
      );
    }

    const shortLivedToken = tokenData.access_token;

    // 2️⃣ Exchange short-lived → long-lived token
    const longTokenUrl = `https://graph.facebook.com/v17.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

    const longTokenResponse = await fetch(longTokenUrl);
    const longTokenData = await longTokenResponse.json();

    if (longTokenData.error) {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(longTokenData.error.message)}`
      );
    }

    const longLivedToken = longTokenData.access_token;

    // 3️⃣ Fetch user pages
    const pagesUrl = `https://graph.facebook.com/v17.0/me/accounts?access_token=${longLivedToken}`;
    const pagesResponse = await fetch(pagesUrl);
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return Response.redirect(`${frontendUrl}/settings?error=no_pages_found`);
    }

    // Select first page (or modify to allow selecting)
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;
    const pageId = page.id;
    const pageName = page.name;

    // 4️⃣ Check if this page has an Instagram Business Account
    const igCheckUrl = `https://graph.facebook.com/v17.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`;
    const igCheckResponse = await fetch(igCheckUrl);
    const igCheckData = await igCheckResponse.json();

    let instagramAccountId = null;
    let instagramUsername = null;

    if (igCheckData.instagram_business_account) {
      instagramAccountId = igCheckData.instagram_business_account.id;

      // Fetch IG username
      const igUserUrl = `https://graph.facebook.com/v17.0/${instagramAccountId}?fields=username&access_token=${pageAccessToken}`;
      const igUserResp = await fetch(igUserUrl);
      const igUserData = await igUserResp.json();

      instagramUsername = igUserData.username;
    }

    // 5️⃣ Subscribe webhook events (messages)
    const subscribeUrl = `https://graph.facebook.com/v17.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins&access_token=${pageAccessToken}`;
    await fetch(subscribeUrl, { method: 'POST' });

    // 6️⃣ Save to Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const verifyToken = 'almared_webhook_' + Math.random().toString(36).substring(7);

    const channel = state; // "instagram" / "facebook" / "whatsapp"

    const { error: upsertError } = await supabase
      .from('channel_integrations')
      .upsert(
        {
          channel: channel,
          is_connected: true,
          config: {
            page_access_token: pageAccessToken,
            page_id: pageId,
            page_name: pageName,
            verify_token: verifyToken,
            instagram_account_id: instagramAccountId,
            account_name: instagramUsername,
            connected_via: 'oauth',
            connected_at: new Date().toISOString(),
          },
        },
        { onConflict: 'channel' }
      );

    if (upsertError) {
      return Response.redirect(`${frontendUrl}/settings?error=database_error`);
    }

    // 7️⃣ Final redirect
    return Response.redirect(`${frontendUrl}/settings?success=${channel}_connected`);

  } catch (err) {
    console.error('Unexpected Error:', err);
    return Response.redirect(`${frontendUrl}/settings?error=unexpected_error`);
  }
});
