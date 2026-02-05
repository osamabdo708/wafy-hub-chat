 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 // Calculate client tier based on order count
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
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     
     const supabase = createClient(supabaseUrl, supabaseServiceKey, {
       auth: {
         autoRefreshToken: false,
         persistSession: false,
       },
     });
 
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
     const userSupabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
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
     const page = parseInt(url.searchParams.get("page") || "1");
     const limit = parseInt(url.searchParams.get("limit") || "20");
     const search = url.searchParams.get("search") || "";
     const tier = url.searchParams.get("tier"); // new, regular, frequent, vip
     const offset = (page - 1) * limit;
 
     // Build query for clients in user's workspace
     let query = supabase
       .from("clients")
       .select(`
         id,
         name,
         phone,
         email,
         avatar_url,
         created_at,
         updated_at
       `, { count: "exact" })
       .eq("workspace_id", workspace.id)
       .order("created_at", { ascending: false });
 
     // Apply search filter
     if (search) {
       query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
     }
 
     // Get all clients first (we need to calculate tiers)
     const { data: allClients, error: clientsError, count: totalCount } = await query;
 
     if (clientsError) {
       console.error("Error fetching clients:", clientsError);
       return new Response(
         JSON.stringify({ 
           success: false,
           error: "Failed to fetch clients",
           error_ar: "فشل في جلب العملاء"
         }),
         { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     // Enrich clients with order count and tier
     const enrichedClients = await Promise.all(
       (allClients || []).map(async (client) => {
         // Count orders for this client
         const { count: orderCount } = await supabase
           .from("orders")
           .select("id", { count: "exact", head: true })
           .eq("client_id", client.id);
 
         // Also count orders by phone number as fallback
         let totalOrders = orderCount || 0;
         if (client.phone) {
           const { count: phoneOrderCount } = await supabase
             .from("orders")
             .select("id", { count: "exact", head: true })
             .eq("customer_phone", client.phone)
             .is("client_id", null);
           totalOrders += (phoneOrderCount || 0);
         }
 
         const tierInfo = getClientTier(totalOrders);
 
         // Get last order date
         const { data: lastOrder } = await supabase
           .from("orders")
           .select("created_at")
           .or(`client_id.eq.${client.id}${client.phone ? `,customer_phone.eq.${client.phone}` : ""}`)
           .order("created_at", { ascending: false })
           .limit(1)
           .maybeSingle();
 
         // Get total spent
         const { data: orderSums } = await supabase
           .from("orders")
           .select("price")
           .or(`client_id.eq.${client.id}${client.phone ? `,customer_phone.eq.${client.phone}` : ""}`)
           .in("status", ["مكتمل", "تم التوصيل"]);
 
         const totalSpent = (orderSums || []).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
 
         return {
           ...client,
           order_count: totalOrders,
           tier: tierInfo.tier,
           tier_en: tierInfo.tier_en,
           total_spent: totalSpent,
           last_order_at: lastOrder?.created_at || null,
         };
       })
     );
 
     // Filter by tier if specified
     let filteredClients = enrichedClients;
     if (tier) {
       const tierMap: { [key: string]: string } = {
         "new": "جديد",
         "regular": "عادي",
         "frequent": "متكرر",
         "vip": "VIP"
       };
       const arabicTier = tierMap[tier.toLowerCase()];
       if (arabicTier) {
         filteredClients = enrichedClients.filter(c => c.tier === arabicTier);
       }
     }
 
     // Apply pagination after filtering
     const paginatedClients = filteredClients.slice(offset, offset + limit);
     const filteredCount = filteredClients.length;
 
     // Calculate tier statistics
     const tierStats = {
       total: enrichedClients.length,
       new: enrichedClients.filter(c => c.tier === "جديد").length,
       regular: enrichedClients.filter(c => c.tier === "عادي").length,
       frequent: enrichedClients.filter(c => c.tier === "متكرر").length,
       vip: enrichedClients.filter(c => c.tier === "VIP").length,
     };
 
     return new Response(
       JSON.stringify({
         success: true,
         data: {
           clients: paginatedClients,
           stats: tierStats,
           pagination: {
             page: Number(page),
             limit: Number(limit),
             total: Number(filteredCount),
             total_pages: Number(Math.ceil(filteredCount / limit)),
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