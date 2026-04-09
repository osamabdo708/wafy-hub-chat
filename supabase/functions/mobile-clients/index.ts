import { authenticateMobileRequest, corsHeaders, authErrorResponse, errorResponse, successResponse } from "../_shared/mobile-auth.ts";

function getClientTier(orderCount: number): { tier: string; tier_en: string } {
  if (orderCount === 0) return { tier: "جديد", tier_en: "new" };
  if (orderCount === 1) return { tier: "عادي", tier_en: "regular" };
  if (orderCount >= 2 && orderCount <= 4) return { tier: "متكرر", tier_en: "frequent" };
  return { tier: "VIP", tier_en: "vip" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateMobileRequest(req);
    if ("error" in auth) return auth.error;

    const { workspace, adminSupabase: supabase } = auth;

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const search = url.searchParams.get("search") || "";
    const tier = url.searchParams.get("tier");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("clients")
      .select("id, name, phone, email, avatar_url, created_at, updated_at", { count: "exact" })
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: allClients, error: clientsError } = await query;

    if (clientsError) {
      console.error("[mobile-clients] Error:", clientsError);
      return errorResponse("Failed to fetch clients", 500);
    }

    const enrichedClients = await Promise.all(
      (allClients || []).map(async (client) => {
        const { count: orderCount } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id);

        let totalOrders = orderCount || 0;
        if (client.phone) {
          const { count: phoneOrderCount } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("customer_phone", client.phone)
            .is("client_id", null);
          totalOrders += phoneOrderCount || 0;
        }

        const tierInfo = getClientTier(totalOrders);

        const { data: lastOrder } = await supabase
          .from("orders")
          .select("created_at")
          .or(`client_id.eq.${client.id}${client.phone ? `,customer_phone.eq.${client.phone}` : ""}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: orderSums } = await supabase
          .from("orders")
          .select("price")
          .or(`client_id.eq.${client.id}${client.phone ? `,customer_phone.eq.${client.phone}` : ""}`)
          .in("status", ["مكتمل", "تم التوصيل"]);

        const totalSpent = (orderSums || []).reduce((sum, o) => sum + (Number(o.price) || 0), 0);

        // Get latest conversation for this client
        const { data: latestConversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("client_id", client.id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...client,
          order_count: totalOrders,
          tier: tierInfo.tier,
          tier_en: tierInfo.tier_en,
          total_spent: totalSpent,
          last_order_at: lastOrder?.created_at || null,
          conversation_id: latestConversation?.id || null,
        };
      })
    );

    let filteredClients = enrichedClients;
    if (tier) {
      const tierMap: Record<string, string> = { new: "جديد", regular: "عادي", frequent: "متكرر", vip: "VIP" };
      const arabicTier = tierMap[tier.toLowerCase()];
      if (arabicTier) filteredClients = enrichedClients.filter((c) => c.tier === arabicTier);
    }

    const paginatedClients = filteredClients.slice(offset, offset + limit);

    const tierStats = {
      total: enrichedClients.length,
      new: enrichedClients.filter((c) => c.tier === "جديد").length,
      regular: enrichedClients.filter((c) => c.tier === "عادي").length,
      frequent: enrichedClients.filter((c) => c.tier === "متكرر").length,
      vip: enrichedClients.filter((c) => c.tier === "VIP").length,
    };

    return successResponse({
      clients: paginatedClients,
      stats: tierStats,
      pagination: { page, limit, total: filteredClients.length, total_pages: Math.ceil(filteredClients.length / limit) },
    });
  } catch (error) {
    console.error("[mobile-clients] Unexpected:", error);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
