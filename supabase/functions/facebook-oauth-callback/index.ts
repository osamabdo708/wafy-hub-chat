import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Support both env variable names
const META_APP_ID = Deno.env.get("META_APP_ID") || Deno.env.get("FACEBOOK_APP_ID") || "1749195285754662";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || Deno.env.get("FACEBOOK_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log("[OAUTH] Callback received:", { code: !!code, state, error });

    if (error) {
      console.error("[OAUTH] Error:", error, errorDescription);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${errorDescription || error}'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code) {
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'Missing authorization code'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Parse state - support both formats:
    // Simple: "facebook" or "instagram"
    // Complex: "channelType|redirectUri"
    let channelType = "facebook";
    let redirectUri = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

    if (state) {
      const parts = state.split("|");
      channelType = parts[0] || "facebook";
      if (parts[1]) {
        redirectUri = parts[1];
      }
    }

    console.log("[OAUTH] Channel:", channelType, "RedirectUri:", redirectUri);

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`;
    
    console.log("[OAUTH] Exchanging code for token...");
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("[OAUTH] Token exchange error:", tokenData.error);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${tokenData.error.message}'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const accessToken = tokenData.access_token;
    console.log("[OAUTH] Got access token");

    // Get long-lived token
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${accessToken}`;
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();
    const longLivedToken = longLivedData.access_token || accessToken;
    console.log("[OAUTH] Got long-lived token");

    // Get user pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedToken}`
    );
    const pagesData = await pagesResponse.json();
    console.log("[OAUTH] Pages data:", JSON.stringify(pagesData));

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const verifyToken = `almared_webhook_${Math.random().toString(36).substring(2, 7)}`;

    // Disconnect any existing connections for this channel first (single account per channel)
    await supabase
      .from("channel_integrations")
      .update({ is_connected: false, updated_at: new Date().toISOString() })
      .eq("channel", channelType)
      .eq("is_connected", true);

    let config: any = { access_token: longLivedToken };
    let accountIdentifier = "Connected Account";
    let accountId = "";

    if (pagesData.data && pagesData.data.length > 0) {
      const page = pagesData.data[0]; // Use first page
      config.page_id = page.id;
      config.page_access_token = page.access_token;
      config.page_name = page.name;
      config.verify_token = verifyToken;
      config.connected_at = new Date().toISOString();
      config.connected_via = "oauth";
      accountIdentifier = page.name;
      accountId = page.id;
      console.log("[OAUTH] Got page:", page.name, "with page access token");

      if (channelType === "instagram") {
        // Get Instagram Business Account linked to this page
        const igResponse = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        const igData = await igResponse.json();
        console.log("[OAUTH] Instagram data:", JSON.stringify(igData));

        if (igData.instagram_business_account) {
          config.instagram_account_id = igData.instagram_business_account.id;
          accountId = igData.instagram_business_account.id;
          
          // Get Instagram username
          const igInfoResponse = await fetch(
            `https://graph.facebook.com/v19.0/${igData.instagram_business_account.id}?fields=username,name,profile_picture_url&access_token=${page.access_token}`
          );
          const igInfo = await igInfoResponse.json();
          console.log("[OAUTH] Instagram info:", JSON.stringify(igInfo));
          config.account_name = igInfo.username || igInfo.name || page.name;
          accountIdentifier = igInfo.username ? `@${igInfo.username}` : (igInfo.name || page.name);
        } else {
          console.log("[OAUTH] No Instagram Business Account found for this page");
          config.account_name = `${page.name} (Facebook)`;
          accountIdentifier = `${page.name} (Facebook)`;
          accountId = page.id;
        }

        // Save Instagram connection - INSERT or UPDATE based on account_id
        const { error: upsertError } = await supabase
          .from("channel_integrations")
          .upsert({
            channel: "instagram",
            account_id: accountId,
            is_connected: true,
            config,
            updated_at: new Date().toISOString()
          }, { onConflict: "channel,account_id", ignoreDuplicates: false });

        if (upsertError) {
          console.error("[OAUTH] Database error:", upsertError);
          return new Response(
            `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'Database error'},'*');window.close();</script></body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        }

        console.log("[OAUTH] Instagram connection saved successfully with account_id:", accountId);
        return new Response(
          `<html><body><script>window.opener.postMessage({type:'oauth_success',channel:'instagram',account:'${accountIdentifier}'},'*');window.close();</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }
    } else {
      console.log("[OAUTH] No pages found, getting user info");
      // Get user info as fallback
      const userResponse = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=name,id&access_token=${longLivedToken}`
      );
      const userData = await userResponse.json();
      console.log("[OAUTH] User data:", JSON.stringify(userData));
      accountIdentifier = userData.name || "Connected Account";
      accountId = userData.id || "";
      config.account_name = accountIdentifier;
      config.verify_token = verifyToken;
      config.connected_at = new Date().toISOString();
      config.connected_via = "oauth";
    }

    // Save Facebook connection with account_id
    const { error: upsertError } = await supabase
      .from("channel_integrations")
      .upsert({
        channel: "facebook",
        account_id: accountId,
        is_connected: true,
        config,
        updated_at: new Date().toISOString()
      }, { onConflict: "channel,account_id", ignoreDuplicates: false });

    if (upsertError) {
      console.error("[OAUTH] Database error:", upsertError);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'Database error'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    console.log("[OAUTH] Facebook connection saved successfully with account_id:", accountId);
    return new Response(
      `<html><body><script>window.opener.postMessage({type:'oauth_success',channel:'facebook',account:'${accountIdentifier}'},'*');window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[OAUTH] Error:", error);
    return new Response(
      `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${errorMessage}'},'*');window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
