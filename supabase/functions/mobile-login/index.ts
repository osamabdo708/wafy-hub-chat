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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password) {
      return authErrorResponse("REQUEST_ERROR", "Email and password are required", false, 400);
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    });

    if (authError || !authData.user) {
      console.log("[MOBILE-LOGIN] Auth failed for:", email, authError?.message);
      return authErrorResponse("AUTH_REQUIRED", "Invalid email or password", false, 401);
    }

    const user = authData.user;
    const session = authData.session;

    console.log(`[MOBILE-LOGIN] Success for user ${user.id}`);

    const [profileResult, workspaceResult] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", user.id).single(),
      supabaseAdmin.from("workspaces").select("id, name").eq("owner_user_id", user.id).single(),
    ]);

    return successResponse({
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
    });
  } catch (error) {
    console.error("[MOBILE-LOGIN] Unexpected error:", error);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
