// -------------------------------------------------------------------------
// FACEBOOK + INSTAGRAM + WHATSAPP OAUTH CALLBACK
// Production-ready version with full logging and IG business detection
// -------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") || "facebook"; // instagram | whatsapp | facebook

  const appId = Deno.env.get("FACEBOOK_APP_ID")!;
  const appSecret = Deno.env.get("FACEBOOK_APP_SECRET")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const frontendUrl = Deno.env.get("FRONTEND_URL")!; // e.g. https://myapp.com

  const redirectUri = `${supabaseUrl}/functions/v1/facebook-oauth-callback`;

  // ---------------------------------------------------------------------
  // ERROR RETURNED FROM FACEBOOK
  // ---------------------------------------------------------------------
  if (error) {
    return Response.redirect(
      `${frontendUrl}/settings?error=${encodeURIComponent(error)}&channel=${state}`
    );
  }

  if (!code) {
    return Response.redirect(`${frontendUrl}/settings?error=no_code`);
  }

  try {
    // ---------------------------------------------------------------------
    // Exchange CODE → Short Token
    // ---------------------------------------------------------------------
    const tokenUrl =
      `https://graph.facebook.com/v17.0/oauth/access_token` +
      `?client_id=${appId}&client_secret=${appSecret}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(tokenData.error.message)}`
      );
    }

    const shortToken = tokenData.access_token;

    // ---------------------------------------------------------------------
    // Convert short_token → long_token
    // ---------------------------------------------------------------------
    const longUrl =
      `https://graph.facebook.com/v17.0/oauth/access_token` +
      `?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}` +
      `&fb_exchange_token=${shortToken}`;

    const longRes = await fetch(longUrl);
    const longData = await longRes.json();

    if (longData.error) {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(longData.error.message)}`
      );
    }

    const longToken = longData.access_token;

    // ---------------------------------------------------------------------
    // Fetch USER PAGES
    // ---------------------------------------------------------------------
    const pagesUrl = `https://graph.facebook.com/v17.0/me/accounts?access_token=${longToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pages = await pagesRes.json();

    if (!pages.data || pages.data.length === 0) {
      return Response.redirect(`${frontendUrl}/settings?error=no_pages_found`);
    }

    // For now: pick the first page (you can extend to allow choosing)
    const page = pages.data[0];
    const pageId = page.id;
    const pageToken = page.access_token;
    const pageName = page.name;

    // ---------------------------------------------------------------------
    // IG BUSINESS ACCOUNT DETECTION
    // ---------------------------------------------------------------------
    let instagramBusinessId = null;
    let instagramUsername = null;

    const igUrl = `https://graph.facebook.com/v17.0/${pageId}?fields=connected_instagram_account&access_token=${pageToken}`;
    const igRes = await fetch(igUrl);
    const igData = await igRes.json();

    if (igData.connected_instagram_account) {
      instagramBusinessId = igData.connected_instagram_account.id;

      // Fetch IG username
      const igUserUrl = `https://graph.facebook.com/v17.0/${instagramBusinessId}?fields=username&access_token=${pageToken}`;
      const igUserRes = await fetch(igUserUrl);
      const igUserData = await igUserRes.json();

      instagramUsername = igUserData.username || null;
    }

    // ---------------------------------------------------------------------
    // SAVE TO SUPABASE
    // ---------------------------------------------------------------------
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const verifyToken = "almared_" + Math.random().toString(36).substring(2, 10);

    const config: any = {
      page_id: pageId,
      page_name: pageName,
      page_access_token: pageToken,
      verify_token: verifyToken,
      connected_at: new Date().toISOString(),
    };

    if (instagramBusinessId) {
      config.instagram_account_id = instagramBusinessId;
      config.account_name = instagramUsername;
    }

    await supabase.from("channel_integrations").upsert(
      {
        channel: state,
        is_connected: true,
        config,
      },
      { onConflict: "channel" }
    );

    // ---------------------------------------------------------------------
    // REDIRECT BACK TO FRONTEND
    // ---------------------------------------------------------------------
    return Response.redirect(
      `${frontendUrl}/settings?success=${state}_connected`
    );

  } catch (err) {
    console.log("UNEXPECTED ERROR:", err);
    return Response.redirect(`${frontendUrl}/settings?error=unexpected_error`);
  }
});
