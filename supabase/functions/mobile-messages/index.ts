import { authenticateMobileRequest, corsHeaders, authErrorResponse, errorResponse, successResponse } from "../_shared/mobile-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateMobileRequest(req);
    if ("error" in auth) return auth.error;

    const { workspace, adminSupabase: supabase } = auth;

    // Parse params from query string or body
    let conversationId: string | null = null;
    let before: string | null = null;
    let limit = 30;

    const url = new URL(req.url);
    conversationId = url.searchParams.get("conversation_id");
    before = url.searchParams.get("before");
    limit = parseInt(url.searchParams.get("limit") || "30");

    if (req.method === "POST" && !conversationId) {
      const body = await req.json().catch(() => ({}));
      conversationId = body.conversation_id;
      before = body.before || null;
      limit = parseInt(String(body.limit)) || 30;
    }

    limit = Math.max(1, Math.min(50, limit));

    if (!conversationId) {
      return errorResponse("conversation_id is required", 400);
    }

    // Verify conversation belongs to workspace
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (!conversation) {
      return errorResponse("Conversation not found or access denied", 404);
    }

    let query = supabase
      .from("messages")
      .select("id, content, sender_type, sender_id, attachments, is_read, created_at, message_id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("[mobile-messages] Query error:", error.message);
      return errorResponse("Failed to fetch messages", 500);
    }

    const nextCursor = messages?.length ? messages[messages.length - 1].created_at : null;

    return successResponse({
      messages: messages || [],
      has_more: messages?.length === limit,
      next_cursor: nextCursor,
    });
  } catch (err) {
    console.error("[mobile-messages] Unexpected:", err);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
