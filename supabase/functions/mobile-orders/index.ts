import { authenticateMobileRequest, corsHeaders, authErrorResponse, errorResponse, successResponse } from "../_shared/mobile-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateMobileRequest(req);
    if ("error" in auth) return auth.error;

    const { workspace, adminSupabase: supabase } = auth;

    const url = new URL(req.url);
    let page = parseInt(url.searchParams.get("page") || "1");
    let limit = parseInt(url.searchParams.get("limit") || "20");
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const paymentStatus = url.searchParams.get("payment_status");

    page = Math.max(1, Math.floor(Number(page) || 1));
    limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    const offset = (page - 1) * limit;

    let query = supabase
      .from("orders")
      .select(`id, order_number, customer_name, customer_phone, customer_email, price, status, payment_status, payment_method, shipping_address, notes, source_platform, agent_name, agent_avatar_url, ai_generated, created_at, updated_at, product_id, service_id, client_id, conversation_id`, { count: "exact" })
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (paymentStatus) query = query.eq("payment_status", paymentStatus);
    if (search) query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data: orders, error: ordersError, count } = await query;

    if (ordersError) {
      console.error("[mobile-orders] Error:", ordersError);
      return errorResponse("Failed to fetch orders", 500);
    }

    const ordersWithDetails = await Promise.all(
      (orders || []).map(async (order) => {
        let productName = null;
        let serviceName = null;
        if (order.product_id) {
          const { data: product } = await supabase.from("products").select("name").eq("id", order.product_id).single();
          productName = product?.name || null;
        }
        if (order.service_id) {
          const { data: service } = await supabase.from("services").select("name").eq("id", order.service_id).single();
          serviceName = service?.name || null;
        }
        return { ...order, product_name: productName, service_name: serviceName };
      })
    );

    const totalCount = typeof count === "number" ? count : 0;

    return successResponse({
      orders: ordersWithDetails,
      pagination: { page, limit, total: totalCount, total_pages: Math.ceil(totalCount / limit) },
    });
  } catch (error) {
    console.error("[mobile-orders] Unexpected:", error);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
