import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken } from "../_shared/crypto.ts";

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
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("[OAUTH-CALLBACK] OAuth error:", error);
    return createErrorResponse(`OAuth error: ${error}`);
  }

  if (!code || !state) {
    return createErrorResponse("Missing code or state parameter");
  }

  try {
    // Parse and validate state
    const stateData = JSON.parse(atob(state));
    const { workspaceId, provider, timestamp, redirectUri } = stateData;

    // Check if state is expired (15 minutes)
    if (Date.now() - timestamp > 15 * 60 * 1000) {
      return createErrorResponse("OAuth session expired. Please try again.");
    }

    console.log("[OAUTH-CALLBACK] Processing callback for", provider, "workspace:", workspaceId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get channel config
    const { data: config } = await supabase
      .from("channel_configs")
      .select("*")
      .eq("provider", provider)
      .single();

    if (!config) {
      return createErrorResponse(`Provider ${provider} not configured`);
    }

    // Get Meta App credentials
    const appId = Deno.env.get("FACEBOOK_APP_ID") || Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET") || Deno.env.get("META_APP_SECRET");

    if (!appId || !appSecret) {
      return createErrorResponse("Meta App credentials not configured");
    }

    // Exchange code for token
    const callbackUrl = `${supabaseUrl}/functions/v1/oauth-callback`;
    const tokenUrl = `${config.token_url}?client_id=${appId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${appSecret}&code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("[OAUTH-CALLBACK] Token exchange error:", tokenData);
      return createErrorResponse(tokenData.error.message || "Failed to exchange token");
    }

    const shortLivedToken = tokenData.access_token;
    console.log("[OAUTH-CALLBACK] Got short-lived token");

    // Exchange for long-lived token
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    const accessToken = longLivedData.access_token || shortLivedToken;
    const expiresIn = longLivedData.expires_in || 3600;
    console.log("[OAUTH-CALLBACK] Got long-lived token, expires in:", expiresIn);

    // Get pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return createErrorResponse("No Facebook Pages found. Please ensure you have admin access to at least one Page.");
    }

    const page = pagesData.data[0];
    console.log("[OAUTH-CALLBACK] Got page:", page.name);

    let channelId = page.id;
    let channelName = page.name;
    let pageAccessToken = page.access_token;

    // For Instagram, get the Instagram Business Account
    if (provider === "instagram") {
      const igResponse = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      const igData = await igResponse.json();

      if (!igData.instagram_business_account?.id) {
        return createErrorResponse("No Instagram Business Account linked to this Page. Please connect an Instagram Business or Creator account to your Facebook Page.");
      }

      // Get Instagram username
      const igInfoResponse = await fetch(
        `https://graph.facebook.com/v19.0/${igData.instagram_business_account.id}?fields=username,name&access_token=${page.access_token}`
      );
      const igInfo = await igInfoResponse.json();

      channelId = igData.instagram_business_account.id;
      channelName = igInfo.username ? `@${igInfo.username}` : igInfo.name || "Instagram Account";
      console.log("[OAUTH-CALLBACK] Got Instagram account:", channelName);
    }

    // Subscribe page to webhooks
    const subscribeFields = provider === "instagram"
      ? "messages,messaging_postbacks"
      : "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads";

    const subscribeUrl = `https://graph.facebook.com/v19.0/${page.id}/subscribed_apps`;
    const subscribeResponse = await fetch(subscribeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: page.access_token,
        subscribed_fields: subscribeFields
      })
    });
    const subscribeData = await subscribeResponse.json();
    const webhookSubscribed = !subscribeData.error;
    console.log("[OAUTH-CALLBACK] Webhook subscription:", webhookSubscribed ? "success" : "failed");

    // Encrypt access token
    const encryptedToken = await encryptToken(pageAccessToken);

    // Disconnect any existing connection for this provider in this workspace
    await supabase
      .from("channel_connections")
      .update({ status: "disconnected" })
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .eq("status", "connected");

    // Create new channel connection
    const { data: connection, error: connectionError } = await supabase
      .from("channel_connections")
      .upsert({
        workspace_id: workspaceId,
        provider,
        provider_channel_id: channelId,
        provider_entity_name: channelName,
        display_name: channelName,
        status: "connected",
        webhook_subscribed: webhookSubscribed,
        last_synced_at: new Date().toISOString()
      }, {
        onConflict: "workspace_id,provider,provider_channel_id"
      })
      .select()
      .single();

    if (connectionError) {
      console.error("[OAUTH-CALLBACK] Failed to create connection:", connectionError);
      return createErrorResponse("Failed to save connection");
    }

    // Store encrypted token
    await supabase
      .from("oauth_tokens")
      .upsert({
        connection_id: connection.id,
        access_token_encrypted: encryptedToken,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        token_type: "bearer",
        meta: {
          page_id: page.id,
          page_access_token_encrypted: await encryptToken(page.access_token)
        }
      }, {
        onConflict: "connection_id"
      });

    // Also update legacy channel_integrations for backward compatibility
    await supabase
      .from("channel_integrations")
      .upsert({
        channel: provider,
        is_connected: true,
        account_id: channelId,
        config: {
          page_id: page.id,
          page_access_token: page.access_token,
          page_name: page.name,
          instagram_id: provider === "instagram" ? channelId : null,
          webhook_subscribed: webhookSubscribed
        }
      }, {
        onConflict: "channel"
      });

    // Create audit log
    await supabase
      .from("audit_logs")
      .insert({
        workspace_id: workspaceId,
        action: "channel_connected",
        entity_type: "channel_connection",
        entity_id: connection.id,
        details: {
          provider,
          channel_id: channelId,
          channel_name: channelName,
          webhook_subscribed: webhookSubscribed
        }
      });

    console.log("[OAUTH-CALLBACK] ✅ Connection complete:", channelName);

    // Return success HTML that sends message to parent and closes
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head>
        <title>Connection Successful</title>
        <style>
          body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .container { text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .success { color: #10b981; font-size: 48px; margin-bottom: 16px; }
          h1 { margin: 0 0 8px 0; color: #1f2937; }
          p { color: #6b7280; margin: 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✓</div>
          <h1>تم الاتصال بنجاح!</h1>
          <p>${channelName}</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-success',
              provider: '${provider}',
              channelId: '${channelId}',
              channelName: '${channelName}',
              workspaceId: '${workspaceId}'
            }, '*');
            setTimeout(() => window.close(), 1500);
          }
        </script>
      </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );

  } catch (error) {
    console.error("[OAUTH-CALLBACK] Error:", error);
    return createErrorResponse(error instanceof Error ? error.message : "Unknown error");
  }
});

function createErrorResponse(message: string): Response {
  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <title>Connection Failed</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef2f2; }
        .container { text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 400px; }
        .error { color: #ef4444; font-size: 48px; margin-bottom: 16px; }
        h1 { margin: 0 0 8px 0; color: #1f2937; }
        p { color: #6b7280; margin: 0; word-break: break-word; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error">✕</div>
        <h1>فشل الاتصال</h1>
        <p>${message}</p>
      </div>
      <script>
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth-error',
            error: '${message.replace(/'/g, "\\'")}'
          }, '*');
          setTimeout(() => window.close(), 3000);
        }
      </script>
    </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
