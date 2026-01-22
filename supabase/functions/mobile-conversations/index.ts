import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---------------- HARD-CODE WORKSPACE ----------------
    const workspaceId = "66ade248-7216-44b2-b212-6c6357fd5281";

    // ---------------- FETCH CONVERSATIONS ----------------
    const { data: conversationsData, error: conversationsError } = await supabaseAdmin
      .from("conversations")
      .select(
        "id, customer_name, customer_phone, customer_email, customer_avatar, channel, status, last_message_at, created_at, updated_at, assigned_to, tags, ai_enabled, assigned_agent_id, client_id"
      )
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false });

    if (conversationsError) throw conversationsError;

    // ---------------- FETCH CLIENT ORDERS ----------------
    const clientIds = [
      ...new Set(
        (conversationsData || []).map((c) => c.client_id).filter(Boolean)
      ),
    ];
    let clientOrderCounts: Record<string, number> = {};

    if (clientIds.length > 0) {
      const { data: ordersData } = await supabaseAdmin
        .from("orders")
        .select("client_id")
        .in("client_id", clientIds);

      (ordersData || []).forEach((order) => {
        if (order.client_id) {
          clientOrderCounts[order.client_id] =
            (clientOrderCounts[order.client_id] || 0) + 1;
        }
      });
    }

    // ---------------- FETCH AGENTS ----------------
    const agentIds = [
      ...new Set(
        (conversationsData || []).map((c) => c.assigned_agent_id).filter(Boolean)
      ),
    ];
    let agentsMap: Record<string, { id: string; name: string; is_ai: boolean }> =
      {};

    if (agentIds.length > 0) {
      const { data: agentsData } = await supabaseAdmin
        .from("agents")
        .select("id, name, is_ai")
        .in("id", agentIds);

      agentsMap = (agentsData || []).reduce((acc, agent) => {
        acc[agent.id] = agent;
        return acc;
      }, {} as Record<string, { id: string; name: string; is_ai: boolean }>);
    }

    // ---------------- FETCH UNREAD COUNTS ----------------
    const conversationsWithUnread = await Promise.all(
      (conversationsData || []).map(async (conv) => {
        const { count, error: countError } = await supabaseAdmin
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("is_read", false)
          .eq("sender_type", "customer");

        if (countError) {
          console.error("Unread count error:", countError);
        }

        return {
          ...conv,
          unread_count: count || 0,
          assigned_agent: conv.assigned_agent_id
            ? agentsMap[conv.assigned_agent_id] || null
            : null,
          order_count: conv.client_id ? clientOrderCounts[conv.client_id] || 0 : 0,
        };
      })
    );

    return new Response(
      JSON.stringify({ success: true, conversations: conversationsWithUnread }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("mobile-conversations REAL ERROR:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || String(err),
        error_ar: "فشل في جلب المحادثات",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
