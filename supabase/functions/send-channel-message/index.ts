import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * UNIFIED MESSAGE SENDING SERVICE
 * 
 * Sends messages to any channel (Facebook, Instagram, WhatsApp)
 * Uses the correct API endpoint and token for each channel
 * 
 * Token lookup is ALWAYS workspace-scoped:
 * - Gets token from channel_integrations WHERE workspace_id = conversation.workspace_id AND channel = conversation.channel
 */

interface SendMessageRequest {
  conversationId: string;
  message: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, message }: SendMessageRequest = await req.json();

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
      .select("id, channel, thread_id, customer_phone, workspace_id")
      .eq("id", conversationId)
      .single();

    if (convError || !conversation) {
      console.error("[SEND-MESSAGE] Conversation not found:", convError);
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const channel = conversation.channel;
    const recipientId = conversation.customer_phone; // This is the sender ID from the customer
    const workspaceId = conversation.workspace_id;

    console.log("[SEND-MESSAGE] Sending to channel:", channel, "recipient:", recipientId, "workspace:", workspaceId);

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: "Conversation has no workspace_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get channel integration for THIS workspace and THIS channel
    const { data: integration, error: intError } = await supabase
      .from("channel_integrations")
      .select("config, account_id")
      .eq("channel", channel)
      .eq("workspace_id", workspaceId)
      .eq("is_connected", true)
      .maybeSingle();

    if (intError || !integration) {
      console.error("[SEND-MESSAGE] No integration found:", intError);
      return new Response(
        JSON.stringify({ error: `No ${channel} integration found for this workspace` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const config = integration.config as any;
    console.log("[SEND-MESSAGE] Found integration with account_id:", integration.account_id);

    // Send message based on channel
    let result: { success: boolean; messageId?: string; error?: string };

    switch (channel) {
      case "facebook":
        result = await sendFacebookMessage(recipientId, message, config);
        break;
      case "instagram":
        result = await sendInstagramMessage(recipientId, message, config);
        break;
      case "whatsapp":
        result = await sendWhatsAppMessage(recipientId, message, config);
        break;
      case "telegram":
        result = await sendTelegramMessage(recipientId, message, config);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported channel: ${channel}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }

    if (!result.success) {
      console.error("[SEND-MESSAGE] Failed to send:", result.error);
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

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    console.log("[SEND-MESSAGE] ✅ Message sent successfully to", channel);

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

// ============================================
// FACEBOOK MESSENGER
// ============================================
async function sendFacebookMessage(
  recipientId: string,
  message: string,
  config: any
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // IMPORTANT: For Facebook, always use the PAGE access token to send messages.
  // Using the user access token will fail with "must be granted before impersonating a user's page".
  const accessToken = config.page_access_token;
  
  if (!accessToken) {
    return { success: false, error: "Facebook page access token missing. Please reconnect Facebook with pages_messaging permission." };
  }

  // Facebook uses /me/messages endpoint with page access token
  const response = await fetch("https://graph.facebook.com/v21.0/me/messages", {
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
    console.error("[SEND-MESSAGE] Facebook API error:", data.error);
    return { success: false, error: data.error.message };
  }

  return { success: true, messageId: data.message_id };
}

// ============================================
// INSTAGRAM
// ============================================
async function sendInstagramMessage(
  recipientId: string,
  message: string,
  config: any
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Use page access token - same approach as auto-reply-messages which works
  const accessToken = config.page_access_token ?? config.access_token;
  
  if (!accessToken) {
    return { success: false, error: "Instagram access token missing. Please reconnect Instagram with instagram_manage_messages permission." };
  }

  // Instagram also uses /me/messages endpoint with page access token (same as Facebook)
  // This is the working approach used in auto-reply-messages
  const response = await fetch("https://graph.facebook.com/v18.0/me/messages", {
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
    console.error("[SEND-MESSAGE] Instagram API error:", data.error);
    return { success: false, error: data.error.message };
  }

  return { success: true, messageId: data.message_id };
}

// ============================================
// WHATSAPP
// ============================================
async function sendWhatsAppMessage(
  recipientId: string,
  message: string,
  config: any
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accessToken = config.access_token;
  const phoneNumberId = config.phone_number_id;
  
  if (!accessToken) {
    return { success: false, error: "No access token for WhatsApp" };
  }

  if (!phoneNumberId) {
    return { success: false, error: "WhatsApp phone number ID not configured" };
  }

  // WhatsApp uses /{phone-number-id}/messages endpoint
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
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

// ============================================
// TELEGRAM
// ============================================
async function sendTelegramMessage(
  chatId: string,
  message: string,
  config: any
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const botToken = config.bot_token;
  
  if (!botToken) {
    return { success: false, error: "Telegram bot token not configured" };
  }

  console.log("[SEND-MESSAGE] Sending Telegram message to chat:", chatId);

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML"
      })
    }
  );

  const data = await response.json();

  if (!data.ok) {
    console.error("[SEND-MESSAGE] Telegram API error:", data);
    return { success: false, error: data.description || "Failed to send Telegram message" };
  }

  return { success: true, messageId: String(data.result.message_id) };
}
