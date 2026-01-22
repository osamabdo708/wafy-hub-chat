import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!,
          },
        },
      }
    );

    /* ---------------------------------------------
       1. AUTHENTICATE USER
    --------------------------------------------- */
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    /* ---------------------------------------------
       2. GET USER WORKSPACE
    --------------------------------------------- */
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!workspace) {
      return new Response(
        JSON.stringify({ error: "Workspace not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    const workspaceId = workspace.id;

    /* ---------------------------------------------
       3. QUERY PARAMS
    --------------------------------------------- */
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel"); // optional
    const limit = Number(url.searchParams.get("limit") ?? 50);

    /* ---------------------------------------------
       4. FETCH CONVERSATIONS
    --------------------------------------------- */
    let query = supabase
      .from("conversations")
      .select(`
        id,
        customer_name,
        customer_phone,
        customer_email,
        customer_avatar,
        channel,
        status,
        last_message_at,
        ai_enabled,
        assigned_agent_id,
        client_id
      `)
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (channel) {
      query = query.eq("channel", channel);
    }

    const { data: conversations, error } = await query;

    if (error) throw error;

    /* ---------------------------------------------
       5. UNREAD COUNTS
    --------------------------------------------- */
    const conversationIds = conversations.map(c => c.id);

    const { data: unreadData } = await supabase
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .eq("sender_type", "customer")
      .eq("is_read", false);

    const unreadMap: Record<string, number> = {};
    unreadData?.forEach(m => {
      unreadMap[m.conversation_id] =
        (unreadMap[m.conversation_id] || 0) + 1;
    });

    /* ---------------------------------------------
       6. AGENTS
    --------------------------------------------- */
    const agentIds = [
      ...new Set(conversations.map(c => c.assigned_agent_id).filter(Boolean)),
    ];

    let agentsMap: Record<string, any> = {};

    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from("agents")
        .select("id, name, is_ai")
        .in("id", agentIds);

      agents?.forEach(agent => {
        agentsMap[agent.id] = agent;
      });
    }

    /* ---------------------------------------------
       7. CLIENT ORDER COUNTS
    --------------------------------------------- */
    const clientIds = [
      ...new Set(conversations.map(c => c.client_id).filter(Boolean)),
    ];

    let orderCountMap: Record<string, number> = {};

    if (clientIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders")
        .select("client_id")
        .in("client_id", clientIds);

      orders?.forEach(o => {
        orderCountMap[o.client_id] =
          (orderCountMap[o.client_id] || 0) + 1;
      });
    }

    /* ---------------------------------------------
       8. FINAL RESPONSE
    --------------------------------------------- */
    const response = conversations.map(conv => ({
      id: conv.id,
      customer_name: conv.customer_name,
      customer_phone: conv.customer_phone,
      customer_email: conv.customer_email,
      customer_avatar: conv.customer_avatar,
      channel: conv.channel,
      status: conv.status,
      last_message_at: conv.last_message_at,
      ai_enabled: conv.ai_enabled,
      unread_count: unreadMap[conv.id] || 0,
      order_count: conv.client_id
        ? orderCountMap[conv.client_id] || 0
        : 0,
      assigned_agent: conv.assigned_agent_id
        ? agentsMap[conv.assigned_agent_id] || null
        : null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: response,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("mobile-conversations error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
