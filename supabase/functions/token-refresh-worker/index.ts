import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken, decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const appId = Deno.env.get("FACEBOOK_APP_ID") || Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET") || Deno.env.get("META_APP_SECRET");

    if (!appId || !appSecret) {
      console.error("[TOKEN-REFRESH] Meta App credentials not configured");
      return new Response(
        JSON.stringify({ error: "Meta App credentials not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Find tokens expiring within 7 days
    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + 7);

    const { data: expiringTokens, error: fetchError } = await supabase
      .from("oauth_tokens")
      .select("*, channel_connections(*)")
      .lt("expires_at", expiryThreshold.toISOString())
      .not("expires_at", "is", null);

    if (fetchError) {
      console.error("[TOKEN-REFRESH] Failed to fetch tokens:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    console.log(`[TOKEN-REFRESH] Found ${expiringTokens?.length || 0} tokens to refresh`);

    const results = {
      refreshed: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const token of expiringTokens || []) {
      try {
        const connection = token.channel_connections;
        if (!connection || connection.status !== "connected") {
          console.log(`[TOKEN-REFRESH] Skipping disconnected connection: ${token.connection_id}`);
          continue;
        }

        // Get channel config for refresh URL
        const { data: config } = await supabase
          .from("channel_configs")
          .select("*")
          .eq("provider", connection.provider)
          .single();

        if (!config?.supports_refresh) {
          console.log(`[TOKEN-REFRESH] Provider ${connection.provider} doesn't support refresh`);
          continue;
        }

        // Decrypt current token
        let currentToken: string;
        try {
          currentToken = await decryptToken(token.access_token_encrypted);
        } catch (e) {
          console.error(`[TOKEN-REFRESH] Failed to decrypt token for ${connection.id}`);
          results.failed++;
          results.errors.push(`Decrypt failed for ${connection.provider}: ${connection.provider_entity_name}`);
          continue;
        }

        // Refresh Meta token (exchange for new long-lived token)
        const refreshUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
        
        const refreshResponse = await fetch(refreshUrl);
        const refreshData = await refreshResponse.json();

        if (refreshData.error) {
          console.error(`[TOKEN-REFRESH] Refresh failed for ${connection.provider_entity_name}:`, refreshData.error);
          
          // Mark connection as expired after 3 failures
          const newRetryCount = (token.meta?.refresh_failures || 0) + 1;
          
          if (newRetryCount >= 3) {
            await supabase
              .from("channel_connections")
              .update({ status: "token_expired" })
              .eq("id", connection.id);

            // Create audit log
            await supabase.from("audit_logs").insert({
              workspace_id: connection.workspace_id,
              action: "token_expired",
              entity_type: "channel_connection",
              entity_id: connection.id,
              details: { error: refreshData.error.message, retries: newRetryCount }
            });
          }

          await supabase
            .from("oauth_tokens")
            .update({ 
              meta: { ...token.meta, refresh_failures: newRetryCount, last_error: refreshData.error.message }
            })
            .eq("id", token.id);

          results.failed++;
          results.errors.push(`${connection.provider}: ${refreshData.error.message}`);
          continue;
        }

        // Encrypt and save new token
        const newEncryptedToken = await encryptToken(refreshData.access_token);
        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 5184000) * 1000);

        await supabase
          .from("oauth_tokens")
          .update({
            access_token_encrypted: newEncryptedToken,
            expires_at: newExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
            meta: { ...token.meta, refresh_failures: 0, last_refreshed: new Date().toISOString() }
          })
          .eq("id", token.id);

        // Update connection sync time
        await supabase
          .from("channel_connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", connection.id);

        console.log(`[TOKEN-REFRESH] ✅ Refreshed token for ${connection.provider}: ${connection.provider_entity_name}`);
        results.refreshed++;

      } catch (e) {
        console.error(`[TOKEN-REFRESH] Error processing token ${token.id}:`, e);
        results.failed++;
        results.errors.push(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    }

    console.log(`[TOKEN-REFRESH] Complete: ${results.refreshed} refreshed, ${results.failed} failed`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[TOKEN-REFRESH] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
