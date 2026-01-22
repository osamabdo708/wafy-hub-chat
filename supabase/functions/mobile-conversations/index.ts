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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Authorization header",
          error_ar: "رأس التفويض مفقود",
        }),
        { status: 401, headers: corsHeaders }
      );
    }

    /* -------------------------------------------------
       1. USER CLIENT (AUTH ONLY)
    ------------------------------------------------- */
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
          error_ar: "غير مصرح",
        }),
        { status: 401, headers: corsHeaders }
      );
    }

    /* -------------------------------------------------
       2. SERVICE CLIENT (DB ACCESS)
    ------------------------------------------------- */
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* -------------------------------------------------
       3. WORKSPACE
    ------------------------------------------------- */
    const { data: workspace, error: workspaceError } =
      await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .single();

    if (workspaceError || !workspace) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Workspace not found",
          error_ar: "لم يتم العثور على مساحة العمل",
        }),
        { status: 404, headers: corsHeaders }
      );
    }

    const workspaceId = workspace.id;

    /* -------------------------------------------------
       4. QUERY PARAMS
    ------------------------------------------------- */
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const limit = Number(url.searchParams.get("limit") ?? 50);

    /* -------------------------------------------------
       5. CONVERSATIONS
    ------------------------------------------------- */
    let convQuery = supabaseAdmin
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
      convQuery = convQuery.eq("channel", channel);
    }

    const { data: conversations, error: convError } =
      await convQuery;

    if (convError) {
      console.error(convError);
      throw convError;
    }

    /* -------------------------------------------------
       6. UNREAD COUNTS
    ------------------------------------------------- */
    const conversationIds = conversations.map(c => c.id);

    const { data: unreadRows } = await supabaseAdmin
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .eq("sender_type", "customer")
      .eq("is_read", false);

    const unreadMap: Record<string, number> = {};
    unreadRows?.forEach(r => {
      unreadMap[r.conversation_id] =
        (unreadMap[r.conversation_id] || 0) + 1;
    });

    /* -------------------------------------------------
       7. AGENTS
    ------------------------------------------------- */
    const agentIds = [
      ...new Set(conversations.map(c => c.assigned_agent_id).filter(Boolean)),
    ];

    let agentsMap: Record<string, any> = {};

    if (agentIds.length > 0) {
      const { data: agents } = await supabaseAdmin
        .from("agents")
        .select("id, name, is_ai")
        .in("id", agentIds);

      agents?.forEach(a => {
        agentsMap[a.id] = a;
      });
    }

    /* -------------------------------------------------
       8. ORDERS
    ------------------------------------------------- */
    const clientIds = [
      ...new Set(conversations.map(c => c.client_id).filter(Boolean)),
    ];

    let orderCountMap: Record<string, number> = {};

    if (clientIds.length > 0) {
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("client_id")
        .in("client_id", clientIds);

      orders?.forEach(o => {
        orderCountMap[o.client_id] =
          (orderCountMap[o.client_id] || 0) + 1;
      });
    }

    /* -------------------------------------------------
       9. RESPONSE
    ------------------------------------------------- */
    const data = conversations.map(conv => ({
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
      JSON.stringify({ success: true, data }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("mobile-conversations error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to fetch conversations",
        error_ar: "فشل في جلب المحادثات",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
