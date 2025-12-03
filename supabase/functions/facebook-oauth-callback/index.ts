// supabase/functions/facebook-oauth-callback/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_APP_ID = Deno.env.get("META_APP_ID");
const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // we expect state to include redirectUri or channel info
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      console.error("OAuth error:", error, errorDescription);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${errorDescription || error}'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code || !state) {
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'Missing code or state'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Expect state format: channel|redirectUri|optionalExtra
    // e.g. instagram|https://your-frontend.com/settings
    const parts = state.split("|");
    const channel = parts[0] || "facebook";
    const redirectUri = parts[1] || `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;
    // (You can extend state shape if needed)

    // Exchange code -> short token (use the same redirectUri used to generate the OAuth URL)
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${tokenData.error.message}'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const shortToken = tokenData.access_token;

    // Convert to long-lived token
    const longUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${shortToken}`;
    const longRes = await fetch(longUrl);
    const longData = await longRes.json();
    const longLivedToken = longData.access_token || shortToken;

    // Fetch pages using the long-lived token
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedToken}`);
    const pagesData = await pagesRes.json();
    console.log("pagesData:", JSON.stringify(pagesData));

    let credentials: any = { access_token: longLivedToken };
    let accountIdentifier = "Connected Account";

    if (pagesData.data && pagesData.data.length > 0) {
      const page = pagesData.data[0];
      credentials.page_id = page.id;
      credentials.page_access_token = page.access_token;
      accountIdentifier = page.name;

      if (channel === "instagram") {
        // Attempt to read instagram_business_account linked to this page
        const igCheckRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
        const igCheck = await igCheckRes.json();
        console.log("igCheck:", JSON.stringify(igCheck));

        if (igCheck.instagram_business_account) {
          credentials.instagram_id = igCheck.instagram_business_account.id;

          // Get IG username
          const igInfoRes = await fetch(`https://graph.facebook.com/v19.0/${credentials.instagram_id}?fields=username,name,profile_picture_url&access_token=${page.access_token}`);
          const igInfo = await igInfoRes.json();
          console.log("igInfo:", JSON.stringify(igInfo));
          accountIdentifier = igInfo.username ? `@${igInfo.username}` : (igInfo.name || accountIdentifier);
        } else {
          // no IG linked to page
          accountIdentifier = `${page.name} (Facebook)`;
        }
      }
    } else {
      // fallback to user info if no pages
      const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=name&access_token=${longLivedToken}`);
      const meData = await meRes.json();
      accountIdentifier = meData.name || accountIdentifier;
    }

    // Save to Supabase (channel_connections table used in your working app)
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Here I'm matching your working table 'channel_connections' shape.
    // Adjust table/fields if you prefer channel_integrations instead.
    const now = new Date().toISOString();
    const channelType = channel; // e.g., 'instagram'
    const { data: existing } = await supabase
      .from("channel_connections")
      .select("id")
      .eq("channel_type", channelType)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("channel_connections")
        .update({
          credentials,
          account_identifier: accountIdentifier,
          is_active: true,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("channel_connections").insert({
        channel_type: channelType,
        channel_name: channelType,
        account_identifier: accountIdentifier,
        credentials,
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    }

    // Return success via popup postMessage as in the working flow
    return new Response(
      `<html><body><script>window.opener.postMessage({type:'oauth_success',channel:'${channelType}',account:'${accountIdentifier}'},'*');window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );

  } catch (err) {
    console.error("Unexpected callback error:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(
      `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${msg}'},'*');window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
