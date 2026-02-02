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

    // Parse query parameters - handle both URL search params and request body
    let conversationId: string | null = null;
    let page = 1;
    let limit = 50;

    // Try to get from URL query params first
    try {
      const url = new URL(req.url);
      conversationId = url.searchParams.get("conversation_id");
      page = parseInt(url.searchParams.get("page") || "1");
      limit = parseInt(url.searchParams.get("limit") || "50");
    } catch (e) {
      console.log("URL parsing failed, trying request body:", e);
    }

    // If not in URL, try request body (for POST requests)
    if (!conversationId && req.method === "POST") {
      try {
        const body = await req.json();
        conversationId = body.conversation_id;
        page = parseInt(String(body.page)) || 1;
        limit = parseInt(String(body.limit)) || 50;
      } catch (e) {
        console.log("Body parsing failed:", e);
      }
    }

    // Ensure page and limit are integers
    page = Math.max(1, Math.floor(Number(page) || 1));
    limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 50)));
    
    const offset = (page - 1) * limit;

    console.log("Parsed params - conversationId:", conversationId, "page:", page, "limit:", limit);

    // Validate conversation_id
    if (!conversationId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "conversation_id is required",
          error_ar: "معرف المحادثة مطلوب"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify conversation exists and belongs to user's workspace
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, workspace_id")
      .eq("id", conversationId)
      .eq("workspace_id", workspace.id)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Conversation not found or access denied",
          error_ar: "المحادثة غير موجودة أو غير مصرح بالوصول إليها"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch messages for the conversation
    // Order by created_at descending (newest first) - client can reverse for display
    const { data: messages, error: messagesError, count } = await supabase
      .from("messages")
      .select(`
        id,
        content,
        sender_type,
        sender_id,
        attachments,
        is_read,
        created_at,
        message_id
      `, { count: "exact" })
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Failed to fetch messages",
          error_ar: "فشل في جلب الرسائل"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalCount = typeof count === 'number' ? count : 0;
    const totalPages = Math.ceil(totalCount / limit);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          messages: messages || [],
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
