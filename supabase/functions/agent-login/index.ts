import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple password hashing using Web Crypto API (same as create-agent-user)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return encode(hashArray);
}

// Generate a random session token
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return encode(array);
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

    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the agent by email
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, email, avatar_url, password_hash, workspace_id, is_user_agent")
      .eq("email", email.toLowerCase())
      .eq("is_user_agent", true)
      .maybeSingle();

    if (agentError || !agent) {
      console.log("Agent not found for email:", email);
      return new Response(
        JSON.stringify({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password
    const inputHash = await hashPassword(password);
    if (inputHash !== agent.password_hash) {
      console.log("Password mismatch for agent:", agent.id);
      return new Response(
        JSON.stringify({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update agent with session token
    const { error: updateError } = await supabase
      .from("agents")
      .update({
        session_token: sessionToken,
        session_expires_at: sessionExpiresAt.toISOString(),
      })
      .eq("id", agent.id);

    if (updateError) {
      console.error("Error updating session:", updateError);
      return new Response(
        JSON.stringify({ error: "فشل في إنشاء الجلسة" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          avatar_url: agent.avatar_url,
          workspace_id: agent.workspace_id,
          workspace_name: workspace?.name,
        },
        session_token: sessionToken,
        expires_at: sessionExpiresAt.toISOString(),
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
