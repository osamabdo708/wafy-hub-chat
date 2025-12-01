import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --------------------
// FETCH ALL PAGES
// --------------------
async function fetchAllPages(url: string) {
  let results: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl);
    const json: any = await res.json();

    if (json.error) {
      console.error("Facebook API error:", json.error);
      break;
    }

    if (json.data) results.push(...json.data);

    nextUrl = json.paging?.next ?? null;
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Import started...");

    // Get Facebook Credentials
    const { data: integration, error: integrationError } = await supabase
      .from("channel_integrations")
      .select("config")
      .eq("channel", "facebook")
      .single();

    if (integrationError || !integration?.config) {
      return new Response(
        JSON.stringify({ error: "Facebook not connected" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const config = integration.config as any;
    const { page_id, page_access_token } = config;

    if (!page_id || !page_access_token) {
      return new Response(
        JSON.stringify({ error: "Invalid Facebook config" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // --------------------------
    // READ ALL CONVERSATIONS
    // --------------------------
    const conversationsUrl =
      `https://graph.facebook.com/v18.0/${page_id}/conversations?fields=id,senders,messages.limit(50){id,message,from,created_time}&access_token=${page_access_token}`;

    console.log("Fetching all conversation pages...");

    const allConversations = await fetchAllPages(conversationsUrl);

    console.log(`Total conversations fetched: ${allConversations.length}`);

    let imported = 0;

    for (const conv of allConversations) {
      try {
        const senderId = conv.senders?.data?.[0]?.id;
        if (!senderId) continue;

        // --------------------------
        // GET USER NAME
        // --------------------------
        const userUrl =
          `https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${page_access_token}`;
        const userRes = await fetch(userUrl);
        const userData = await userRes.json();
        const customerName = userData.name || `Customer ${senderId}`;

        // --------------------------
        // CHECK IF CONVERSATION EXISTS
        // --------------------------
        const { data: existing } = await supabase
          .from("conversations")
          .select("id")
          .eq("customer_phone", senderId)
          .eq("channel", "facebook")
          .maybeSingle();

        let conversationId;

        if (existing) {
          conversationId = existing.id;

          // Update last message date
          await supabase
            .from("conversations")
            .update({
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversationId);
        } else {
          // Create new conversation
          const { data: newConv, error: newConvErr } = await supabase
            .from("conversations")
            .insert({
              customer_name: customerName,
              customer_phone: senderId,
              channel: "facebook",
              status: "جديد",
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (newConvErr) {
            console.error("Error creating conversation:", newConvErr);
            continue;
          }

          conversationId = newConv.id;
        }

        // --------------------------
        // IMPORT NEW MESSAGES ONLY
        // --------------------------
        const msgs = conv.messages?.data ?? [];

        for (const msg of msgs) {
          if (!msg.message) continue;

          // Check if message exists
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("content", msg.message)
            .maybeSingle();

          if (!existingMsg) {
            await supabase
              .from("messages")
              .insert({
                conversation_id: conversationId,
                content: msg.message,
                sender_type: msg.from?.id === page_id ? "agent" : "customer",
                created_at: msg.created_time,
              });
          }
        }

        imported++;
      } catch (e) {
        console.error("Conversation import error:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported,
        message: `تم استيراد ${imported} محادثة`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Import function error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
