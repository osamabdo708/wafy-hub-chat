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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get auth token from header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Authorization token required",
          error_ar: "رمز التفويض مطلوب"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client with user's token
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the token and get user
    const { data: { user }, error: userError } = await userSupabase.auth.getUser();
    
    // Service client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (userError || !user) {
      console.log("Invalid token:", userError?.message);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid or expired token",
          error_ar: "رمز غير صالح أو منتهي الصلاحية"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!workspace) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "No workspace found for user",
          error_ar: "لم يتم العثور على مساحة عمل للمستخدم"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    let page = parseInt(url.searchParams.get("page") || "1");
    let limit = parseInt(url.searchParams.get("limit") || "20");
    const status = url.searchParams.get("status"); // order status filter
    const search = url.searchParams.get("search"); // search by order number or customer name
    const dateFrom = url.searchParams.get("date_from"); // filter by date range
    const dateTo = url.searchParams.get("date_to");
    const paymentStatus = url.searchParams.get("payment_status"); // payment status filter

    // Ensure page and limit are proper integers
    page = Math.max(1, Math.floor(Number(page) || 1));
    limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    const offset = (page - 1) * limit;

    console.log("Fetching orders - page:", page, "limit:", limit, "status:", status, "search:", search);

    // Build query for orders in user's workspace
    let query = supabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        customer_email,
        price,
        status,
        payment_status,
        payment_method,
        shipping_address,
        notes,
        source_platform,
        agent_name,
        agent_avatar_url,
        ai_generated,
        created_at,
        updated_at,
        product_id,
        service_id,
        client_id,
        conversation_id
      `, { count: "exact" })
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (paymentStatus) {
      query = query.eq("payment_status", paymentStatus);
    }
    if (search) {
      query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data: orders, error: ordersError, count } = await query;

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Failed to fetch orders",
          error_ar: "فشل في جلب الطلبات"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get product/service names for each order
    const ordersWithDetails = await Promise.all(
      (orders || []).map(async (order) => {
        let productName = null;
        let serviceName = null;

        if (order.product_id) {
          const { data: product } = await supabase
            .from("products")
            .select("name, image_url")
            .eq("id", order.product_id)
            .single();
          if (product) {
            productName = product.name;
          }
        }

        if (order.service_id) {
          const { data: service } = await supabase
            .from("services")
            .select("name, image_url")
            .eq("id", order.service_id)
            .single();
          if (service) {
            serviceName = service.name;
          }
        }

        return {
          ...order,
          product_name: productName,
          service_name: serviceName,
        };
      })
    );

    const totalCount = typeof count === 'number' ? count : 0;
    const totalPages = Math.ceil(totalCount / limit);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          orders: ordersWithDetails,
          pagination: {
            page: page,
            limit: limit,
            total: totalCount,
            total_pages: totalPages,
          }
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: "Internal server error",
        error_ar: "خطأ داخلي في الخادم"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
