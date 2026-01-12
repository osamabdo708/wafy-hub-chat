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

    // Verify the requesting user is authenticated and is a workspace owner
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

    const { name, email, password, avatar_url, workspace_id } = await req.json();

    if (!name || !email || !password || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, email, password, workspace_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify requesting user is the workspace owner
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id, owner_user_id")
      .eq("id", workspace_id)
      .single();

    if (wsError || !workspace) {
      return new Response(
        JSON.stringify({ error: "Workspace not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (workspace.owner_user_id !== requestingUser.id) {
      return new Response(
        JSON.stringify({ error: "Only workspace owners can create agent users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the auth user
    const { data: authData, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: name,
        avatar_url: avatar_url || null,
        is_agent: true,
        workspace_id: workspace_id,
      },
    });

    if (createUserError) {
      console.error("Error creating auth user:", createUserError);
      return new Response(
        JSON.stringify({ error: createUserError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authData.user.id;

    // Create profile for the agent
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: newUserId,
        email: email,
        full_name: name,
        avatar_url: avatar_url || null,
      });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      // Rollback - delete the auth user
      await supabase.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Failed to create profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the agent record linked to the auth user
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .insert({
        name,
        email,
        avatar_url: avatar_url || null,
        workspace_id,
        user_id: newUserId,
        is_ai: false,
        is_system: false,
        is_user_agent: true,
      })
      .select()
      .single();

    if (agentError) {
      console.error("Error creating agent:", agentError);
      // Rollback - delete the auth user and profile
      await supabase.from("profiles").delete().eq("id", newUserId);
      await supabase.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Failed to create agent" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        agent,
        message: "Agent user created successfully" 
      }),
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
