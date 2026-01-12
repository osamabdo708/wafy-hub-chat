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

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { agent_id } = await req.json();

    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: "Missing agent_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the agent details
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*, workspaces!inner(owner_user_id)")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify requesting user is the workspace owner
    if (agent.workspaces.owner_user_id !== requestingUser.id) {
      return new Response(
        JSON.stringify({ error: "Only workspace owners can delete agent users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If the agent has a linked user account, delete it
    if (agent.user_id && agent.is_user_agent) {
      // Delete profile first
      await supabase.from("profiles").delete().eq("id", agent.user_id);
      
      // Delete the auth user
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(agent.user_id);
      if (deleteUserError) {
        console.error("Error deleting auth user:", deleteUserError);
      }
    }

    // Delete the agent record
    const { error: deleteAgentError } = await supabase
      .from("agents")
      .delete()
      .eq("id", agent_id);

    if (deleteAgentError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete agent" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Agent deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
