import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory lock to prevent duplicate processing
const processingLock = new Set<string>();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[AUTO-REPLY] Starting AI auto-reply check...');

    // Find conversations with AI enabled that have unreplied messages
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, customer_name, customer_phone, thread_id, platform, channel, ai_enabled, workspace_id')
      .eq('ai_enabled', true);

    if (!conversations || conversations.length === 0) {
      console.log('[AUTO-REPLY] No AI-enabled conversations found.');
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processedCount = 0;

    for (const conversation of conversations) {
      // Check if already processing this conversation (prevent duplicates)
      if (processingLock.has(conversation.id)) {
        console.log(`[AUTO-REPLY] Skipping ${conversation.id} - already processing`);
        continue;
      }

      // Get ALL unreplied messages
      const { data: unrepliedMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'customer')
        .eq('reply_sent', false)
        .eq('is_old', false)
        .order('created_at', { ascending: true });

      if (!unrepliedMessages || unrepliedMessages.length === 0) continue;

      // Check if the most recent unreplied message is at least 8 seconds old (wait for customer to finish typing)
      const mostRecentMessage = unrepliedMessages[unrepliedMessages.length - 1];
      const messageAge = Date.now() - new Date(mostRecentMessage.created_at).getTime();
      const WAIT_TIME = 8 * 1000;

      if (messageAge < WAIT_TIME) {
        console.log(`[AI-REPLY] Waiting for ${conversation.id} - message only ${Math.floor(messageAge / 1000)}s old`);
        continue;
      }

      // Lock this conversation
      processingLock.add(conversation.id);

      try {
        // Double-check no AI message was sent in last 5 seconds (prevent race conditions)
        const { data: recentAiMessages } = await supabase
          .from('messages')
          .select('id, created_at')
          .eq('conversation_id', conversation.id)
          .eq('sender_type', 'agent')
          .order('created_at', { ascending: false })
          .limit(1);

        if (recentAiMessages && recentAiMessages.length > 0) {
          const lastAiTime = new Date(recentAiMessages[0].created_at).getTime();
          if (Date.now() - lastAiTime < 5000) {
            console.log(`[AI-REPLY] Skipping ${conversation.id} - AI replied ${Math.floor((Date.now() - lastAiTime) / 1000)}s ago`);
            continue;
          }
        }

        // Mark messages as replied FIRST to prevent duplicate processing
        const messageIds = unrepliedMessages.map(m => m.id);
        await supabase
          .from('messages')
          .update({ reply_sent: true })
          .in('id', messageIds);

        console.log(`[AI-REPLY] Processing ${conversation.id} with ${unrepliedMessages.length} messages`);

        // Get products for this workspace
        const { data: products } = await supabase
          .from('products')
          .select('id, name, description, price, stock, attributes')
          .eq('workspace_id', conversation.workspace_id)
          .eq('is_active', true);

        // Get last 15 messages for context
        const { data: contextMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(15);

        const messageHistory = contextMessages?.reverse().map(m => ({
          role: m.sender_type === 'customer' ? 'user' : 'assistant',
          content: m.content
        })) || [];

        // Build products context with attributes
        const productsContext = products?.map(p => {
          let info = `${p.name}: ${p.price}ر`;
          if (p.stock !== null) info += ` (مخزون: ${p.stock})`;
          
          // Add attributes info
          const attrs = p.attributes as any;
          if (attrs?.colors?.length > 0) {
            info += ` | ألوان: ${attrs.colors.map((c: any) => c.name).join('، ')}`;
          }
          
          return info;
        }).join('\n') || 'لا توجد منتجات';

        // Human-like prompt
        const systemPrompt = `أنت مساعد مبيعات ودود. تتكلم بشكل طبيعي مثل الإنسان.

📦 المنتجات:
${productsContext}

⚡ قواعد الرد:
- رد قصير جداً (جملة أو جملتين فقط)
- لا تكرر نفسك أبداً
- إذا المنتج له ألوان/مقاسات، اسأل عنها قبل الطلب
- كن ودود ومرح، استخدم إيموجي باعتدال
- لا تسأل أسئلة كثيرة مرة وحدة

💬 أمثلة:
- "شو في عندكم؟" → "عندنا [المنتجات] بأسعار حلوة! شو يهمك؟ 😊"
- "أبغى أطلب" → "تمام! أي لون تحب؟" (إذا في ألوان)
- "كم السعر؟" → "[السعر]ر + الشحن 👌"

👤 العميل: ${conversation.customer_name || 'زائر'}`;

        // Call OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              ...messageHistory
            ],
            temperature: 0.85,
            max_tokens: 150
          }),
        });

        if (!response.ok) {
          console.error(`[AI-REPLY] OpenAI error: ${response.status}`);
          // Revert reply_sent
          await supabase.from('messages').update({ reply_sent: false }).in('id', messageIds);
          continue;
        }

        const aiData = await response.json();
        let aiReply = aiData.choices?.[0]?.message?.content;

        if (!aiReply || aiReply.trim() === '') {
          aiReply = 'أهلاً! كيف أقدر أساعدك؟ 😊';
        }

        // Save AI message
        await supabase
          .from('messages')
          .insert({
            conversation_id: conversation.id,
            content: aiReply,
            sender_type: 'agent',
            message_id: `ai_${Date.now()}_${conversation.id}`,
            reply_sent: true,
            is_old: false
          });

        // Send to channel
        if ((conversation.channel === 'facebook' || conversation.channel === 'instagram') && conversation.customer_phone) {
          const { data: channelConfig } = await supabase
            .from('channel_integrations')
            .select('config')
            .eq('channel', conversation.channel)
            .eq('workspace_id', conversation.workspace_id)
            .eq('is_connected', true)
            .maybeSingle();

          if (channelConfig?.config) {
            const config = channelConfig.config as any;
            const sendUrl = `https://graph.facebook.com/v18.0/me/messages?access_token=${config.page_access_token}`;
            
            const sendResponse = await fetch(sendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: conversation.customer_phone },
                message: { text: aiReply }
              })
            });

            if (!sendResponse.ok) {
              console.error(`[AI-REPLY] Send error:`, await sendResponse.text());
            } else {
              console.log(`[AI-REPLY] ✅ Sent to ${conversation.channel}`);
            }
          }
        } else if (conversation.channel === 'whatsapp' && conversation.customer_phone) {
          const { data: whatsappConfig } = await supabase
            .from('channel_integrations')
            .select('config')
            .eq('channel', 'whatsapp')
            .eq('workspace_id', conversation.workspace_id)
            .eq('is_connected', true)
            .maybeSingle();

          if (whatsappConfig?.config) {
            const config = whatsappConfig.config as any;
            if (config.phone_number_id && config.access_token) {
              await fetch(`https://graph.facebook.com/v18.0/${config.phone_number_id}/messages`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${config.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: conversation.customer_phone,
                  type: 'text',
                  text: { body: aiReply }
                })
              });
            }
          }
        }

        processedCount++;
      } finally {
        // Always release the lock
        processingLock.delete(conversation.id);
      }
    }

    console.log(`[AUTO-REPLY] Processed ${processedCount} conversations.`);

    return new Response(
      JSON.stringify({ success: true, processed: processedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AUTO-REPLY] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
