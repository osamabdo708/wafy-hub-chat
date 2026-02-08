import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    )!;

    /* ---------------- AUTH ---------------- */

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authorization token required",
          error_ar: "رمز التفويض مطلوب",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userSupabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid or expired token",
          error_ar: "رمز غير صالح أو منتهي الصلاحية",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    /* ------------- WORKSPACE -------------- */

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
          error_ar: "لم يتم العثور على مساحة عمل للمستخدم",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /* ----------- QUERY PARAMS ------------- */

    let conversationId: string | null = null;
    let before: string | null = null;
    let limit = 30;

    try {
      const url = new URL(req.url);
      conversationId = url.searchParams.get("conversation_id");
      before = url.searchParams.get("before");
      limit = parseInt(url.searchParams.get("limit") || "30");
    } catch {}

    if (req.method === "POST" && !conversationId) {
      const body = await req.json();
      conversationId = body.conversation_id;
      before = body.before || null;
      limit = parseInt(String(body.limit)) || 30;
    }

    limit = Math.max(1, Math.min(50, limit));

    if (!conversationId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "conversation_id is required",
          error_ar: "معرف المحادثة مطلوب",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /* -------- CONVERSATION CHECK ---------- */

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("workspace_id", workspace.id)
      .single();

    if (!conversation) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Conversation not found or access denied",
          error_ar:
            "المحادثة غير موجودة أو غير مصرح بالوصول إليها",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    /* ------------- MESSAGES --------------- */

    let query = supabase
      .from("messages")
      .select(
        `
        id,
        content,
        sender_type,
        sender_id,
        attachments,
        is_read,
        created_at,
        message_id
      `
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to fetch messages",
          error_ar: "فشل في جلب الرسائل",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const nextCursor =
      messages && messages.length
        ? messages[messages.length - 1].created_at
        : null;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          messages: messages || [],
          has_more: messages?.length === limit,
          next_cursor: nextCursor,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        error_ar: "خطأ داخلي في الخادم",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
