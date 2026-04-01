import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function authErrorResponse(code: string, message: string, retryable: boolean, status: number) {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code, message, retryable },
    }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

export function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ success: false, error: { code: "REQUEST_ERROR", message, retryable: false } }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

export function successResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Validates Bearer token and returns user + workspace + adminSupabase.
 * Returns consistent error envelope for mobile clients.
 */
export async function authenticateMobileRequest(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: authErrorResponse("AUTH_REQUIRED", "Authorization token required", false, 401),
    };
  }

  const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await userSupabase.auth.getUser();

  if (userError || !user) {
    const msg = userError?.message || "";
    if (msg.includes("expired") || msg.includes("JWT expired")) {
      return {
        error: authErrorResponse("ACCESS_TOKEN_EXPIRED", "Access token has expired, please refresh", true, 401),
      };
    }
    return {
      error: authErrorResponse("AUTH_REQUIRED", "Invalid or expired token", false, 401),
    };
  }

  const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: workspace } = await adminSupabase
    .from("workspaces")
    .select("id, name")
    .eq("owner_user_id", user.id)
    .single();

  if (!workspace) {
    return {
      error: authErrorResponse("AUTH_REQUIRED", "No workspace found for user", false, 404),
    };
  }

  return { user, workspace, adminSupabase };
}
