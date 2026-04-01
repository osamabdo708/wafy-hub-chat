import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authErrorResponse, successResponse } from "../_shared/mobile-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return authErrorResponse("REQUEST_ERROR", "Only POST is allowed", false, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return authErrorResponse("AUTH_REQUIRED", "Authorization token required", false, 401);
    }

    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await userSupabase.auth.getUser();

    // Even if token expired, try to parse user for cleanup
    const body = await req.json().catch(() => ({}));
    const { fcm_token, device_id } = body;

    const userId = user?.id;

    console.log(`[MOBILE-LOGOUT] user: ${userId || "unknown"}, device_id: ${device_id || "unknown"}`);

    if (userId) {
      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Remove FCM token if provided
      if (fcm_token) {
        await adminSupabase
          .from("device_tokens")
          .delete()
          .eq("user_id", userId)
          .eq("fcm_token", fcm_token);
        console.log(`[MOBILE-LOGOUT] Removed FCM token for user ${userId}`);
      }

      // Sign out the user's session (revokes refresh token)
      await userSupabase.auth.signOut();
      console.log(`[MOBILE-LOGOUT] Session revoked for user ${userId}`);
    }

    return successResponse({ message: "Logged out successfully" });
  } catch (error) {
    console.error("[MOBILE-LOGOUT] Unexpected error:", error);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
