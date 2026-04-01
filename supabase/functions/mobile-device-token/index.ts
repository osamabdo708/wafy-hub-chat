import { authenticateMobileRequest, corsHeaders, authErrorResponse, errorResponse, successResponse } from "../_shared/mobile-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateMobileRequest(req);
    if ("error" in auth) return auth.error;

    const { user, adminSupabase: supabase } = auth;

    if (req.method === "POST") {
      const { fcm_token, device_info } = await req.json();
      if (!fcm_token) return errorResponse("fcm_token is required", 400);

      console.log(`[mobile-device-token] Register for user ${user.id}`);

      const { error: upsertError } = await supabase
        .from("device_tokens")
        .upsert(
          { user_id: user.id, fcm_token, device_info: device_info || null, updated_at: new Date().toISOString() },
          { onConflict: "user_id,fcm_token" }
        );

      if (upsertError) {
        console.error("[mobile-device-token] Upsert error:", upsertError);
        return errorResponse("Failed to register token", 500);
      }

      return successResponse({ message: "Token registered" });
    }

    if (req.method === "DELETE") {
      const { fcm_token } = await req.json();
      if (!fcm_token) return errorResponse("fcm_token is required", 400);

      await supabase.from("device_tokens").delete().eq("user_id", user.id).eq("fcm_token", fcm_token);
      return successResponse({ message: "Token removed" });
    }

    return authErrorResponse("REQUEST_ERROR", "Method not allowed", false, 405);
  } catch (error) {
    console.error("[mobile-device-token] Unexpected:", error);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
