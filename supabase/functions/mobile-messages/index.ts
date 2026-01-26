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

    const token = authHeader.replace("Bearer ", "");

    // Verify the token and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

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
    const conversationId = url.searchParams.get("conversation_id");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          messages: messages || [],
          pagination: {
            page,
            limit,
            total: count || 0,
            total_pages: Math.ceil((count || 0) / limit),
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
