import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function sendError(
  socket: WebSocket,
  error: string,
  error_ar: string,
  code?: string
) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        success: false,
        error,
        error_ar,
        ...(code && { code }),
      })
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "WebSocket upgrade required",
        error_ar: "مطلوب ترقية WebSocket",
      }),
      {
        status: 426,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const { socket, response } = Deno.upgradeWebSocket(req);

  let supabase: ReturnType<typeof createClient> | null = null;
  let workspaceId: string | null = null;

  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: "ready",
        message: "Send { type: 'auth', token: 'Bearer <jwt>' } then { type: 'get_messages', conversation_id, before?, limit? }",
      })
    );
  };

  socket.onmessage = async (event) => {
    try {
      const raw = event.data;
      if (typeof raw !== "string") return;
      const msg = JSON.parse(raw) as Record<string, unknown>;
      const type = msg.type as string | undefined;

      if (type === "auth") {
        const token = msg.token as string | undefined;
        if (!token?.startsWith("Bearer ")) {
          sendError(
            socket,
            "Authorization token required",
            "رمز التفويض مطلوب",
            "AUTH_REQUIRED"
          );
          return;
        }

        const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: token } },
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const {
          data: { user },
          error: userError,
        } = await userSupabase.auth.getUser();

        if (userError || !user) {
          sendError(
            socket,
            "Invalid or expired token",
            "رمز غير صالح أو منتهي الصلاحية",
            "INVALID_TOKEN"
          );
          return;
        }

        supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: workspace } = await supabase
          .from("workspaces")
          .select("id")
          .eq("owner_user_id", user.id)
          .single();

        if (!workspace) {
          sendError(
            socket,
            "No workspace found for user",
            "لم يتم العثور على مساحة عمل للمستخدم",
            "NO_WORKSPACE"
          );
          return;
        }

        workspaceId = workspace.id;
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "auth_ok", success: true }));
        }
        return;
      }

      if (type === "get_messages") {
        if (!supabase || !workspaceId) {
          sendError(
            socket,
            "Authenticate first with { type: 'auth', token: '...' }",
            "يجب المصادقة أولاً",
            "AUTH_REQUIRED"
          );
          return;
        }

        const conversationId = msg.conversation_id as string | undefined;
        if (!conversationId) {
          sendError(
            socket,
            "conversation_id is required",
            "معرف المحادثة مطلوب",
            "BAD_REQUEST"
          );
          return;
        }

        let before: string | null =
          (msg.before as string | null | undefined) ?? null;
        let limit = typeof msg.limit === "number" ? msg.limit : 30;
        limit = Math.max(1, Math.min(50, limit));

        const { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("id", conversationId)
          .eq("workspace_id", workspaceId)
          .single();

        if (!conversation) {
          sendError(
            socket,
            "Conversation not found or access denied",
            "المحادثة غير موجودة أو غير مصرح بالوصول إليها",
            "NOT_FOUND"
          );
          return;
        }

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
          sendError(
            socket,
            "Failed to fetch messages",
            "فشل في جلب الرسائل",
            "QUERY_ERROR"
          );
          return;
        }

        const nextCursor =
          messages && messages.length
            ? messages[messages.length - 1].created_at
            : null;

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "messages",
              success: true,
              data: {
                messages: messages || [],
                has_more: messages?.length === limit,
                next_cursor: nextCursor,
              },
            })
          );
        }
        return;
      }

      sendError(
        socket,
        "Unknown message type. Use 'auth' or 'get_messages'.",
        "نوع رسالة غير معروف",
        "BAD_REQUEST"
      );
    } catch (err) {
      console.error(err);
      sendError(
        socket,
        "Internal server error",
        "خطأ داخلي في الخادم",
        "INTERNAL"
      );
    }
  };

  socket.onerror = (e) => console.error("WebSocket error:", e);
  socket.onclose = () => {
    supabase = null;
    workspaceId = null;
  };

  return response;
});
