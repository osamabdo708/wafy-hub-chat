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

  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");
    const workspaceId = url.searchParams.get("workspace_id");
    const redirectUri = url.searchParams.get("redirect_uri");

    if (!provider || !workspaceId) {
      return new Response(
        JSON.stringify({ error: "Missing provider or workspace_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get channel config from database
    const { data: config, error: configError } = await supabase
      .from("channel_configs")
      .select("*")
      .eq("provider", provider)
      .single();

    if (configError || !config) {
      console.error("[OAUTH-CONNECT] Config not found for provider:", provider);
      return new Response(
        JSON.stringify({ error: `Provider ${provider} not configured` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!config.auth_url) {
      return new Response(
        JSON.stringify({ error: `Provider ${provider} does not support OAuth` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Determine which app credentials to use based on provider
    let appId: string | null = null;

    if (provider === "instagram") {
      // Instagram MUST use its own dedicated credentials
      const { data: igAppIdSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'INSTAGRAM_APP_ID')
        .single();

      appId = igAppIdSetting?.value || null;

      if (!appId) {
        return new Response(
          JSON.stringify({ error: "Instagram App ID not configured. Please configure it in Super Admin settings." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      console.log("[OAUTH-CONNECT] Using Instagram App ID:", appId);
    } else {
      // Facebook/WhatsApp use Meta App credentials
      const { data: appIdSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'META_APP_ID')
        .single();

      appId = appIdSetting?.value || Deno.env.get("FACEBOOK_APP_ID") || Deno.env.get("META_APP_ID");
    }
    
    if (!appId) {
      return new Response(
        JSON.stringify({ error: "App ID not configured. Please configure it in Super Admin settings." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log("[OAUTH-CONNECT] Using App ID:", appId, "for provider:", provider);

    // Generate state with workspace info for CSRF protection
    const state = btoa(JSON.stringify({
      workspaceId,
      provider,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
      redirectUri: redirectUri || `${supabaseUrl}/functions/v1/oauth-callback`
    }));

    // Get scopes for this provider
    const scopes = config.scopes?.default || config.scopes?.[provider] || [];
    const scopeString = Array.isArray(scopes) ? scopes.join(",") : scopes;

    // Build OAuth URL
    const callbackUrl = `${supabaseUrl}/functions/v1/oauth-callback`;
    const authUrl = new URL(config.auth_url);
    authUrl.searchParams.set("client_id", appId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", scopeString);
    authUrl.searchParams.set("response_type", "code");

    console.log("[OAUTH-CONNECT] Generated auth URL for", provider);

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        state 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[OAUTH-CONNECT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
