import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Starting webhook-like Facebook import...");

    // Fetch FB credentials
    const { data: integration, error: integrationError } = await supabase
      .from("channel_integrations")
      .select("config")
      .eq("channel", "facebook")
      .single();

    if (integrationError || !integration?.config) {
      return new Response(
        JSON.stringify({ error: "Facebook not connected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { page_id, page_access_token } = integration.config;

    // Get numeric page id
    const pageInfo = await fetch(
      `https://graph.facebook.com/v18.0/${page_id}?fields=id&access_token=${page_access_token}`
    ).then((r) => r.json());

    const numericPageId = pageInfo.id;

    // Fetch conversations (webhook-like: always get recent)
    let nextPage = null;
    let importedCount = 0;

    do {
      const url = nextPage || 
        `https://graph.facebook.com/v18.0/${page_id}/conversations?fields=id,senders,messages.limit(50){message,from,created_time}&access_token=${page_access_token}`;

      const response = await fetch(url).then((r) => r.json());
      nextPage = response.paging?.next ?? null;

      if (!response.data) break;

      for (const fbConv of response.data) {
        const senderId = fbConv.senders?.data?.[0]?.id;
        if (!senderId) continue;

        // Get sender name
        const userData = await fetch(
          `https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${page_access_token}`
        ).then((r) => r.json());

        const customerName = userData.name || `عميل ${senderId}`;

        // Check if conversation exists
        const { data: existing } = await supabase
          .from("conversations")
          .select("id")
          .eq("customer_phone", senderId)
          .eq("channel", "facebook")
          .single();

        let conversationId;

        if (existing) {
          conversationId = existing.id;

          await supabase
            .from("conversations")
            .update({
              last_message_at: fbConv.messages?.data?.[0]?.created_time,
              updated_at: new Date().toISOString()
            })
            .eq("id", conversationId);
        } else {
          const { data: newConv } = await supabase
            .from("conversations")
            .insert({
              customer_name: customerName,
              customer_phone: senderId,
              channel: "facebook",
              status: "جديد",
              last_message_at: fbConv.messages?.data?.[0]?.created_time
            })
            .select()
            .single();

          conversationId = newConv.id;
        }

        // Import messages
        for (const msg of fbConv.messages?.data || []) {
          if (!msg.message) continue;

          const senderType = msg.from?.id === numericPageId ? "agent" : "customer";

          const { data: exists } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("content", msg.message)
            .eq("created_at", msg.created_time)
            .eq("sender_type", senderType)
            .single();

          if (!exists) {
            await supabase
              .from("messages")
              .insert({
                conversation_id: conversationId,
                content: msg.message,
                sender_type: senderType,
                created_at: msg.created_time
              });
          }
        }

        importedCount++;
      }
    } while (nextPage);

    return new Response(
      JSON.stringify({
        success: true,
        imported: importedCount,
        message: `تم استيراد ${importedCount} محادثة`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
