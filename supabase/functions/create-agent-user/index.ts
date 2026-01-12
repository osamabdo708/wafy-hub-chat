import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return encode(hashArray);
}

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

    // Check if email is already used by another agent
    const { data: existingAgent } = await supabase
      .from("agents")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingAgent) {
      return new Response(
        JSON.stringify({ error: "هذا البريد الإلكتروني مستخدم بالفعل" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash the password
    const passwordHash = await hashPassword(password);

    // Create the agent record with hashed password (no auth user needed)
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .insert({
        name,
        email: email.toLowerCase(),
        avatar_url: avatar_url || null,
        workspace_id,
        password_hash: passwordHash,
        is_ai: false,
        is_system: false,
        is_user_agent: true,
      })
      .select()
      .single();

    if (agentError) {
      console.error("Error creating agent:", agentError);
      return new Response(
        JSON.stringify({ error: "Failed to create agent" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        agent: {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          avatar_url: agent.avatar_url,
          is_user_agent: agent.is_user_agent,
        },
        message: "Agent created successfully" 
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
