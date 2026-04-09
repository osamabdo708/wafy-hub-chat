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
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("conversations")
      .select(`id, customer_name, customer_phone, customer_avatar, channel, status, last_message_at, created_at, assigned_agent_id, ai_enabled`, { count: "exact" })
      .eq("workspace_id", workspace.id)
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (channel) query = query.eq("channel", channel);

    const { data: conversations, error: convError, count } = await query;

    if (convError) {
      console.error("[mobile-conversations] Error:", convError);
      return errorResponse("Failed to fetch conversations", 500);
    }

    const conversationsWithLastMessage = await Promise.all(
      (conversations || []).map(async (conv) => {
        const { data: lastMessage } = await supabase
          .from("messages")
          .select("content, sender_type, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const { count: unreadCount } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("is_read", false)
          .eq("sender_type", "customer");

        const { count: orderCount } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id);

        return {
          ...conv,
          unread_count: unreadCount || 0,
          order_count: orderCount || 0,
          last_message: lastMessage || null,
          mared_enabled: conv.ai_enabled || false,
        };
      })
    );

    return successResponse({
      conversations: conversationsWithLastMessage,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("[mobile-conversations] Unexpected:", error);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
