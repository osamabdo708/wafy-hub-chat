import { authenticateMobileRequest, corsHeaders, errorResponse, successResponse } from "../_shared/mobile-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateMobileRequest(req);
    if ("error" in auth) return auth.error;

    const { workspace, adminSupabase: supabase } = auth;
    const wid = workspace.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekISO = weekAgo.toISOString();

    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthISO = monthAgo.toISOString();

    const completedStatuses = ["مكتمل", "تم التوصيل"];

    // Parallel queries for stats
    const [
      allOrdersRes,
      todayOrdersRes,
      weekOrdersRes,
      monthOrdersRes,
      totalConvsRes,
      activeConvsRes,
      clientsRes,
      workspaceRes,
      channelsRes,
      shopifyRes,
    ] = await Promise.all([
      supabase.from("orders").select("price").eq("workspace_id", wid).in("status", completedStatuses),
      supabase.from("orders").select("price").eq("workspace_id", wid).in("status", completedStatuses).gte("created_at", todayISO),
      supabase.from("orders").select("price").eq("workspace_id", wid).in("status", completedStatuses).gte("created_at", weekISO),
      supabase.from("orders").select("price").eq("workspace_id", wid).in("status", completedStatuses).gte("created_at", monthISO),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", wid),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", wid).in("status", ["جديد", "مفتوح"]),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", wid),
      supabase.from("workspaces").select("settings").eq("id", wid).single(),
      supabase.from("channel_integrations").select("channel, is_connected, account_id, config").eq("workspace_id", wid),
      supabase.from("shopify_settings").select("is_connected, store_url, shop_name").eq("workspace_id", wid).limit(1).maybeSingle(),
    ]);

    const sumPrices = (data: any[]) => (data || []).reduce((s, o) => s + Number(o.price || 0), 0);

    // Avg response time from last 20 conversations
    let avgResponseMinutes: number | null = null;
    const { data: recentConvs } = await supabase
      .from("conversations")
      .select("id, created_at")
      .eq("workspace_id", wid)
      .order("created_at", { ascending: false })
      .limit(20);

    if (recentConvs && recentConvs.length > 0) {
      let totalMs = 0;
      let count = 0;
      for (const conv of recentConvs) {
        const { data: firstAgentMsg } = await supabase
          .from("messages")
          .select("created_at")
          .eq("conversation_id", conv.id)
          .in("sender_type", ["agent", "system"])
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (firstAgentMsg) {
          const diff = new Date(firstAgentMsg.created_at).getTime() - new Date(conv.created_at!).getTime();
          if (diff > 0 && diff < 86400000) {
            totalMs += diff;
            count++;
          }
        }
      }
      if (count > 0) avgResponseMinutes = Math.round(totalMs / count / 60000);
    }

    const settings = (workspaceRes.data?.settings as Record<string, unknown>) || {};
    const maredEnabled = Boolean(settings.default_ai_enabled);

    // Build channels list
    const channels = (channelsRes.data || []).map((ch: any) => ({
      channel: ch.channel,
      is_connected: ch.is_connected || false,
      account_id: ch.account_id || null,
      account_name: ch.config?.page_name || ch.config?.bot_username || ch.config?.business_account_id || null,
    }));

    const shopify = shopifyRes.data
      ? {
          is_connected: shopifyRes.data.is_connected || false,
          store_url: shopifyRes.data.store_url || null,
          shop_name: shopifyRes.data.shop_name || null,
        }
      : { is_connected: false, store_url: null, shop_name: null };

    return successResponse({
      stats: {
        total_sales: sumPrices(allOrdersRes.data),
        total_orders: (allOrdersRes.data || []).length,
        today_sales: sumPrices(todayOrdersRes.data),
        today_orders: (todayOrdersRes.data || []).length,
        week_sales: sumPrices(weekOrdersRes.data),
        week_orders: (weekOrdersRes.data || []).length,
        month_sales: sumPrices(monthOrdersRes.data),
        month_orders: (monthOrdersRes.data || []).length,
        total_conversations: totalConvsRes.count || 0,
        active_conversations: activeConvsRes.count || 0,
        total_clients: clientsRes.count || 0,
        avg_response_minutes: avgResponseMinutes,
      },
      mared: {
        default_enabled: maredEnabled,
      },
      shopify,
      channels,
    });
  } catch (error) {
    console.error("[mobile-dashboard] Unexpected:", error);
    return errorResponse("Failed to fetch dashboard data", 500);
  }
});
