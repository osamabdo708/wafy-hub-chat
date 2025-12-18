import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMetaSignature } from "../_shared/webhook-signature.ts";
import { detectMetaSource, getMetaUserInfo } from "../_shared/message-router.ts";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Use a unified verify token
    const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "lovable_webhook_2024";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[WEBHOOK-META] Verification successful");
      return new Response(challenge, { status: 200 });
    }

    console.error("[WEBHOOK-META] Verification failed");
    return new Response("Forbidden", { status: 403 });
  }

  // Handle OPTIONS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle webhook events (POST)
  if (req.method === "POST") {
    try {
      const rawBody = await req.text();
      const signature = req.headers.get("X-Hub-Signature-256");
      const appSecret = Deno.env.get("FACEBOOK_APP_SECRET") || Deno.env.get("META_APP_SECRET");

      // Verify signature
      if (appSecret && !verifyMetaSignature(rawBody, signature, appSecret)) {
        console.error("[WEBHOOK-META] Invalid signature");
        return new Response("Invalid signature", { status: 403 });
      }

      const payload = JSON.parse(rawBody);
      console.log("[WEBHOOK-META] Received:", payload.object);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Detect source from payload
      const source = detectMetaSource(payload);
      if (!source) {
        console.log("[WEBHOOK-META] No message detected in payload");
        return new Response("OK", { status: 200 });
      }

      // Skip echo messages (messages we sent)
      if (source.isEcho) {
        console.log("[WEBHOOK-META] Skipping echo message");
        return new Response("OK", { status: 200 });
      }

      console.log("[WEBHOOK-META] Detected:", source.provider, source.channelId, "from:", source.senderId);

      // MULTI-TENANT: route the SAME webhook event to ALL matching workspaces.
      // IMPORTANT: We CANNOT deduplicate globally by messageId, because multiple workspaces
      // can legitimately receive the same message for the same connected page/account.
      const targets = await getMatchingTargets(supabase, source);

      if (targets.length === 0) {
        console.error("[WEBHOOK-META] No workspaces found for channel:", source.channelId);
        return new Response("OK", { status: 200 });
      }

      console.log(`[WEBHOOK-META] Routing event to ${targets.length} workspace(s)`);

      for (const target of targets) {
        await processMessageForWorkspace({
          supabase,
          payload,
          source,
          workspaceId: target.workspaceId,
          accessToken: target.accessToken,
        });
      }

      return new Response("OK", { status: 200 });

    } catch (error) {
      console.error("[WEBHOOK-META] Error:", error);
      return new Response("OK", { status: 200 }); // Always return 200 to Meta
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
