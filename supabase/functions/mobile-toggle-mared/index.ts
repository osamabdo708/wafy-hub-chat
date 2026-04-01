import { authenticateMobileRequest, corsHeaders, authErrorResponse, errorResponse, successResponse } from "../_shared/mobile-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateMobileRequest(req);
    if ("error" in auth) return auth.error;

    const { workspace, adminSupabase: supabase } = auth;

    const body = await req.json();
    const { conversation_id, enabled } = body;

    if (!conversation_id) return errorResponse("conversation_id is required", 400);
    if (typeof enabled !== "boolean") return errorResponse("enabled must be a boolean", 400);

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .eq("workspace_id", workspace.id)
      .single();

    if (!conversation) return errorResponse("Conversation not found", 404);

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ ai_enabled: enabled })
      .eq("id", conversation_id);

    if (updateError) {
      console.error("[mobile-toggle-mared] Update error:", updateError);
      return errorResponse("Failed to update Mared status", 500);
    }

    if (enabled) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${supabaseUrl}/functions/v1/auto-reply-messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ conversationId: conversation_id }),
        });
      } catch (e) {
        console.error("[mobile-toggle-mared] Auto-reply trigger error:", e);
      }
    }

    return successResponse({
      conversation_id,
      mared_enabled: enabled,
      message: enabled ? "المارد مفعل الآن" : "تم إيقاف المارد",
      message_en: enabled ? "Mared is now enabled" : "Mared is now disabled",
    });
  } catch (error) {
    console.error("[mobile-toggle-mared] Unexpected:", error);
    return authErrorResponse("TEMPORARY_AUTH_FAILURE", "Temporary server error, please retry", true, 500);
  }
});
