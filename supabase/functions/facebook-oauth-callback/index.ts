import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID") || "1749195285754662";
const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET");
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

    console.log("[OAUTH] Received callback with state:", state);

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

    const channel = state || "facebook";
    const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

    // Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;
    console.log("[OAUTH] Exchanging code for token...");
    
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("[OAUTH] Token exchange error:", tokenData.error);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${tokenData.error.message}'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const shortToken = tokenData.access_token;
    console.log("[OAUTH] Got short-lived token");

    // Convert to long-lived token
    const longUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${shortToken}`;
    const longRes = await fetch(longUrl);
    const longData = await longRes.json();
    const longLivedToken = longData.access_token || shortToken;
    console.log("[OAUTH] Got long-lived token");

    // Fetch ALL pages using the long-lived token
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedToken}&limit=100`);
    const pagesData = await pagesRes.json();
    console.log("[OAUTH] Pages data:", JSON.stringify(pagesData));

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    if (!pagesData.data || pagesData.data.length === 0) {
      console.log("[OAUTH] No pages found");
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'لم يتم العثور على صفحات. تأكد من أن لديك صلاحيات إدارة صفحة فيسبوك.'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // For Facebook channel, use first page
    // For Instagram channel, find page with linked Instagram account
    let selectedPage = pagesData.data[0];
    let config: any = {};
    let accountName = selectedPage.name;
    const verifyToken = `almared_webhook_${Math.random().toString(36).substring(2, 7)}`;

    if (channel === "instagram") {
      console.log("[OAUTH] Looking for Instagram business account...");
      
      let instagramFound = false;
      
      for (const page of pagesData.data) {
        console.log(`[OAUTH] Checking page: ${page.name} (${page.id})`);
        
        const igCheckRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        const igCheck = await igCheckRes.json();
        console.log(`[OAUTH] Instagram check for ${page.name}:`, JSON.stringify(igCheck));

        if (igCheck.instagram_business_account) {
          // Get Instagram account info
          const igInfoRes = await fetch(
            `https://graph.facebook.com/v19.0/${igCheck.instagram_business_account.id}?fields=username,name,profile_picture_url&access_token=${page.access_token}`
          );
          const igInfo = await igInfoRes.json();
          console.log("[OAUTH] Instagram info:", JSON.stringify(igInfo));

          config = {
            page_id: page.id,
            page_name: page.name,
            page_access_token: page.access_token,
            instagram_account_id: igCheck.instagram_business_account.id,
            account_name: igInfo.username || igInfo.name || page.name,
            verify_token: verifyToken,
            connected_at: new Date().toISOString(),
            connected_via: "oauth"
          };
          accountName = igInfo.username || igInfo.name || page.name;
          instagramFound = true;
          break;
        }
      }

      if (!instagramFound) {
        console.log("[OAUTH] No Instagram business account found on any page");
        return new Response(
          `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'لم يتم العثور على حساب إنستغرام للأعمال مرتبط بأي صفحة. تأكد من ربط حساب إنستغرام بصفحة فيسبوك الخاصة بك.'},'*');window.close();</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      // Save to channel_integrations table
      const { error: upsertError } = await supabase
        .from("channel_integrations")
        .upsert({
          channel: "instagram",
          is_connected: true,
          config,
          updated_at: new Date().toISOString()
        }, { onConflict: "channel" });

      if (upsertError) {
        console.error("[OAUTH] Database error:", upsertError);
        return new Response(
          `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'خطأ في حفظ البيانات'},'*');window.close();</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      console.log("[OAUTH] Instagram connected successfully:", accountName);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_success',channel:'instagram',account:'${accountName}'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );

    } else {
      // Facebook Messenger
      config = {
        page_id: selectedPage.id,
        page_name: selectedPage.name,
        page_access_token: selectedPage.access_token,
        verify_token: verifyToken,
        connected_at: new Date().toISOString(),
        connected_via: "oauth"
      };

      const { error: upsertError } = await supabase
        .from("channel_integrations")
        .upsert({
          channel: "facebook",
          is_connected: true,
          config,
          updated_at: new Date().toISOString()
        }, { onConflict: "channel" });

      if (upsertError) {
        console.error("[OAUTH] Database error:", upsertError);
        return new Response(
          `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'خطأ في حفظ البيانات'},'*');window.close();</script></body></html>`,
          { headers: { "Content-Type": "text/html" } }
        );
      }

      console.log("[OAUTH] Facebook connected successfully:", accountName);
      return new Response(
        `<html><body><script>window.opener.postMessage({type:'oauth_success',channel:'facebook',account:'${accountName}'},'*');window.close();</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

  } catch (err) {
    console.error("[OAUTH] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(
      `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${msg}'},'*');window.close();</script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
