import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function errorResponse(code: string, message: string, retryable: boolean, status: number) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message, retryable } }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Only POST is allowed", false, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json().catch(() => ({}));
    const { refresh_token, device_id } = body;

    if (!refresh_token) {
      return errorResponse("REFRESH_TOKEN_INVALID", "refresh_token is required", false, 400);
    }

    console.log(`[MOBILE-REFRESH] Refresh attempt, device_id: ${device_id || "unknown"}`);

    // Use anon key client for auth operations
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Attempt to refresh the session
    const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (refreshError || !sessionData?.session || !sessionData?.user) {
      const reason = refreshError?.message || "unknown";
      console.log(`[MOBILE-REFRESH] Failed: ${reason}, device_id: ${device_id || "unknown"}`);

      // All refresh failures = deterministic 401
      return errorResponse(
        "REFRESH_TOKEN_INVALID",
        "refresh token invalid or expired",
        false,
        401
      );
    }

    const user = sessionData.user;
    const session = sessionData.session;

    console.log(`[MOBILE-REFRESH] Success for user ${user.id}, device_id: ${device_id || "unknown"}`);

    // Get user profile and workspace
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [profileResult, workspaceResult] = await Promise.all([
      adminSupabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
      adminSupabase.from("workspaces").select("id, name").eq("owner_user_id", user.id).single(),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: profileResult.data?.full_name || user.user_metadata?.full_name,
            avatar_url: profileResult.data?.avatar_url,
            workspace_id: workspaceResult.data?.id,
            workspace_name: workspaceResult.data?.name,
          },
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: new Date(session.expires_at! * 1000).toISOString(),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[MOBILE-REFRESH] Unexpected error:", error);
    return errorResponse(
      "TEMPORARY_AUTH_FAILURE",
      "Temporary server error, please retry",
      true,
      500
    );
  }
});
