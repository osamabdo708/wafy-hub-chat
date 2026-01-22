import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use anon key for auth operations
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Service client for fetching additional data
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Email and password are required",
          error_ar: "البريد الإلكتروني وكلمة المرور مطلوبان"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate using Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password: password,
    });

    if (authError || !authData.user) {
      console.log("Auth failed for email:", email, authError?.message);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid email or password",
          error_ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = authData.user;
    const session = authData.session;

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .single();

    // Get user's workspace
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .eq("owner_user_id", user.id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: profile?.full_name || user.user_metadata?.full_name,
            avatar_url: profile?.avatar_url,
            workspace_id: workspace?.id,
            workspace_name: workspace?.name,
          },
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: new Date(session.expires_at! * 1000).toISOString(),
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: "Internal server error",
        error_ar: "خطأ داخلي في الخادم"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});