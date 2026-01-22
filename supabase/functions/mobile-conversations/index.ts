import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
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

    // Get session token from header
    const sessionToken = req.headers.get("x-session-token");

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Session token is required",
          error_ar: "رمز الجلسة مطلوب"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify session token and get agent
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, workspace_id, session_token, session_expires_at")
      .eq("session_token", sessionToken)
      .eq("is_user_agent", true)
      .maybeSingle();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Invalid or expired session",
          error_ar: "جلسة غير صالحة أو منتهية"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if session expired
    if (agent.session_expires_at && new Date(agent.session_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Session expired",
          error_ar: "انتهت صلاحية الجلسة"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const status = url.searchParams.get("status"); // active, closed, all
    const channel = url.searchParams.get("channel"); // whatsapp, telegram, etc.
    const offset = (page - 1) * limit;

    // Build query for conversations assigned to this agent
    let query = supabase
      .from("conversations")
      .select(`
        id,
        customer_name,
        customer_phone,
        customer_avatar,
        channel,
        status,
        ai_enabled,
        created_at,
        updated_at,
        client_id,
        clients (
          id,
          name,
          phone,
          avatar_url
        )
      `, { count: 'exact' })
      .eq("workspace_id", agent.workspace_id)
      .eq("assigned_agent_id", agent.id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (channel) {
      query = query.eq("channel", channel);
    }

    const { data: conversations, error: convError, count } = await query;

    if (convError) {
      console.error("Error fetching conversations:", convError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Failed to fetch conversations",
          error_ar: "فشل في جلب المحادثات"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get last message and unread count for each conversation
    const conversationsWithDetails = await Promise.all(
      (conversations || []).map(async (conv) => {
        // Get last message
        const { data: lastMessage } = await supabase
          .from("messages")
          .select("id, content, sender_type, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get unread count
        const { count: unreadCount } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("sender_type", "customer")
          .eq("is_read", false);

        return {
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount || 0,
        };
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          conversations: conversationsWithDetails,
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
