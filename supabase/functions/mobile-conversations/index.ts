import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ---------------------------------- */
/* CORS                               */
/* ---------------------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/* ---------------------------------- */
/* Serve                              */
/* ---------------------------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    /* ---------------------------------- */
    /* ENV VALIDATION                     */
    /* ---------------------------------- */
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      console.error("❌ Missing Supabase environment variables");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server misconfiguration",
          error_ar: "إعدادات الخادم غير صحيحة",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ---------------------------------- */
    /* AUTH HEADER                        */
    /* ---------------------------------- */
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authorization token required",
          error_ar: "رمز التفويض مطلوب",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    /* ---------------------------------- */
    /* USER CLIENT (AUTH VALIDATION)      */
    /* ---------------------------------- */
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      console.error("❌ Invalid token", authError?.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid or expired token",
          error_ar: "رمز غير صالح أو منتهي الصلاحية",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ---------------------------------- */
    /* SERVICE ROLE CLIENT (DB ACCESS)    */
    /* ---------------------------------- */
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    /* ---------------------------------- */
    /* USER WORKSPACE                     */
    /* ---------------------------------- */
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (wsError) {
      console.error("❌ Workspace query failed", wsError);
    }

    if (!workspace) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No workspace found for user",
          error_ar: "لم يتم العثور على مساحة عمل للمستخدم",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ---------------------------------- */
    /* QUERY PARAMS                       */
    /* ---------------------------------- */
    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");

    const offset = (page - 1) * limit;

    /* ---------------------------------- */
    /* CONVERSATIONS QUERY                */
    /* ---------------------------------- */
    let query = supabase
      .from("conversations")
      .select(
        `
        id,
        customer_name,
        customer_phone,
        customer_avatar,
        channel,
        status,
        last_message_at,
        created_at,
        unread_count,
        assigned_agent_id
      `,
        { count: "exact" }
      )
      .eq("workspace_id", workspace.id)
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (channel) query = query.eq("channel", channel);

    const { data: conversations, error: convError, count } = await query;

    if (convError) {
      console.error("❌ Conversation query failed", convError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to fetch conversations",
          error_ar: "فشل في جلب المحادثات",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /* ---------------------------------- */
    /* LAST MESSAGE (SAFE)                */
    /* ---------------------------------- */
    const conversationsWithLastMessage = await Promise.all(
      (conversations || []).map(async (conv) => {
        try {
          const { data: lastMessage } = await supabase
            .from("messages")
            .select("content, sender_type, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return { ...conv, last_message: lastMessage || null };
        } catch (e) {
          console.error("❌ Message fetch failed", e);
          return { ...conv, last_message: null };
        }
      })
    );

    /* ---------------------------------- */
    /* RESPONSE                           */
    /* ---------------------------------- */
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          conversations: conversationsWithLastMessage,
          pagination: {
            page,
            limit,
            total: count || 0,
            total_pages: Math.ceil((count || 0) / limit),
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("🔥 Unexpected error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        error_ar: "خطأ داخلي في الخادم",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
