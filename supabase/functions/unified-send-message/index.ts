import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendMessageRequest {
  conversationId: string;
  message: string;
  workspaceId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, message, workspaceId }: SendMessageRequest = await req.json();

    if (!conversationId || !message) {
      return new Response(
        JSON.stringify({ error: "Missing conversationId or message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const provider = conversation.channel;
    const recipientId = conversation.thread_id;

    console.log("[SEND-MESSAGE] Sending to", provider, "recipient:", recipientId);

    // Try new system first - get token from channel_connections
    let accessToken: string | null = null;
    
    if (conversation.workspace_id) {
      const { data: connection } = await supabase
        .from("channel_connections")
        .select("*, oauth_tokens(*)")
        .eq("workspace_id", conversation.workspace_id)
        .like("provider", `${provider}%`)
        .eq("status", "connected")
        .single();

      if (connection?.oauth_tokens?.[0]) {
        try {
          accessToken = await decryptToken(connection.oauth_tokens[0].access_token_encrypted);
        } catch (e) {
          console.error("[SEND-MESSAGE] Failed to decrypt token:", e);
        }
      }
    }

    // Fallback to legacy channel_integrations - use workspace_id to get correct token
    if (!accessToken && conversation.workspace_id) {
      const { data: integrations } = await supabase
        .from("channel_integrations")
        .select("config")
        .like("channel", `${provider}%`)
        .eq("workspace_id", conversation.workspace_id)
        .eq("is_connected", true);

      const integration = integrations?.[0]; // Use the first one found as a fallback

      if (integration?.config?.page_access_token) {
        accessToken = integration.config.page_access_token;
        console.log("[SEND-MESSAGE] Using legacy token for workspace:", conversation.workspace_id);
      }
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: `No access token found for ${provider}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Send message based on provider
    let result: { success: boolean; messageId?: string; error?: string };

    switch (provider) {
      case "facebook":
      case "instagram":
        result = await sendMetaMessage(recipientId, message, accessToken);
        break;
      case "whatsapp":
        result = await sendWhatsAppMessage(recipientId, message, accessToken, supabase, conversation.workspace_id);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported provider: ${provider}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Save outbound message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      message_id: result.messageId,
      content: message,
      sender_type: "agent",
      is_old: false,
      reply_sent: true,
      is_read: true
    });

    // Update conversation
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    console.log("[SEND-MESSAGE] ✅ Message sent successfully");

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SEND-MESSAGE] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

async function sendMetaMessage(
  recipientId: string,
  message: string,
  accessToken: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const response = await fetch("https://graph.facebook.com/v19.0/me/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: accessToken
    })
  });

  const data = await response.json();

  if (data.error) {
    console.error("[SEND-MESSAGE] Meta API error:", data.error);
    return { success: false, error: data.error.message };
  }

  return { success: true, messageId: data.message_id };
}

async function sendWhatsAppMessage(
  recipientId: string,
  message: string,
  accessToken: string,
  supabase: any,
  workspaceId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Get WhatsApp phone number ID from the specific integration that owns this conversation
  const { data: conversationIntegration } = await supabase
    .from("channel_integrations")
    .select("config")
    .eq("workspace_id", workspaceId)
    .like("channel", "whatsapp%")
    .eq("is_connected", true)
    .single(); // Assuming one connected WhatsApp account per workspace for now

  const phoneNumberId = conversationIntegration?.config?.phone_number_id;
  if (!phoneNumberId) {
    return { success: false, error: "WhatsApp phone number ID not configured" };
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientId,
        type: "text",
        text: { body: message }
      })
    }
  );

  const data = await response.json();

  if (data.error) {
    console.error("[SEND-MESSAGE] WhatsApp API error:", data.error);
    return { success: false, error: data.error.message };
  }

  return { success: true, messageId: data.messages?.[0]?.id };
}
