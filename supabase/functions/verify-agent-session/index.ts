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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { session_token } = await req.json();

    if (!session_token) {
      return new Response(
        JSON.stringify({ valid: false, error: "No session token provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find agent with this session token
    const { data: agent, error } = await supabase
      .from("agents")
      .select("id, name, email, avatar_url, workspace_id, session_expires_at, is_user_agent")
      .eq("session_token", session_token)
      .eq("is_user_agent", true)
      .maybeSingle();

    if (error || !agent) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if session is expired
    if (agent.session_expires_at && new Date(agent.session_expires_at) < new Date()) {
      // Clear expired session
      await supabase
        .from("agents")
        .update({ session_token: null, session_expires_at: null })
        .eq("id", agent.id);

      return new Response(
        JSON.stringify({ valid: false, error: "Session expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get workspace info
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", agent.workspace_id)
      .single();

    return new Response(
      JSON.stringify({
        valid: true,
        agent: {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          avatar_url: agent.avatar_url,
          workspace_id: agent.workspace_id,
          workspace_name: workspace?.name,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
