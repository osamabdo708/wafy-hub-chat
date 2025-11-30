import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Get all products for AI context
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    // Find conversations with AI enabled that have unreplied messages
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, customer_name, customer_phone, channel, ai_enabled')
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
      // Check for new unreplied messages
      const { data: unrepliedMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'customer')
        .eq('reply_sent', false)
        .eq('is_old', false)
        .order('created_at', { ascending: false });

      if (!unrepliedMessages || unrepliedMessages.length === 0) continue;

      console.log(`[AI-REPLY] Processing conversation ${conversation.id} with ${unrepliedMessages.length} unreplied messages`);

      // Get last 10 messages for context
      const { data: contextMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const messageHistory = contextMessages?.reverse().map(m => ({
        role: m.sender_type === 'customer' ? 'user' : 'assistant',
        content: m.content
      })) || [];

      // Build AI system prompt
      const productsContext = products?.map(p => 
        `- ${p.name}: ${p.description} (السعر: ${p.price} ريال)`
      ).join('\n') || 'لا توجد منتجات متاحة';

      const systemPrompt = `أنت مندوب مبيعات محترف وودود في متجر إلكتروني. 
      
مهمتك:
1. التحدث بشكل طبيعي وبشري دون تكرار الأسئلة
2. استخراج احتياجات العميل من المحادثة تلقائياً
3. اقتراح المنتجات المناسبة من الكتالوج أدناه
4. عند تأكيد العميل رغبته في الشراء، قم بإنشاء الطلب باستخدام الأداة create_order

المنتجات المتاحة:
${productsContext}

قواعد هامة:
- لا تطلب بيانات العميل إلا عند تأكيد الطلب فقط
- اكتشف اسم المنتج والكمية من سياق المحادثة
- تحدث بأسلوب بشري طبيعي
- يمكن للعميل طلب أكثر من منتج في نفس المحادثة
- عند التأكيد النهائي للطلب، استخدم أداة create_order`;

      // Call OpenAI with tool calling for order creation
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
          tools: [{
            type: 'function',
            function: {
              name: 'create_order',
              description: 'إنشاء طلب جديد عندما يؤكد العميل رغبته في الشراء',
              parameters: {
                type: 'object',
                properties: {
                  product_name: { type: 'string', description: 'اسم المنتج' },
                  quantity: { type: 'number', description: 'الكمية' },
                  customer_name: { type: 'string', description: 'اسم العميل' },
                  customer_phone: { type: 'string', description: 'رقم هاتف العميل' },
                  notes: { type: 'string', description: 'ملاحظات إضافية' }
                },
                required: ['product_name', 'quantity']
              }
            }
          }],
          temperature: 0.7
        }),
      });

      if (!response.ok) {
        console.error(`[AI-REPLY] OpenAI error: ${response.status}`);
        continue;
      }

      const aiData = await response.json();
      const aiMessage = aiData.choices?.[0]?.message;

      if (!aiMessage) continue;

      // Check if AI wants to create an order
      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        for (const toolCall of aiMessage.tool_calls) {
          if (toolCall.function.name === 'create_order') {
            const orderData = JSON.parse(toolCall.function.arguments);
            
            // Find product
            const product = products?.find(p => 
              p.name.toLowerCase().includes(orderData.product_name.toLowerCase())
            );

            if (product) {
              const { error: orderError } = await supabase
                .from('orders')
                .insert({
                  customer_name: orderData.customer_name || conversation.customer_name,
                  customer_phone: orderData.customer_phone || conversation.customer_phone,
                  product_id: product.id,
                  price: product.price * (orderData.quantity || 1),
                  status: 'قيد الانتظار',
                  notes: orderData.notes || '',
                  conversation_id: conversation.id,
                  source_platform: conversation.channel,
                  created_by: 'AI',
                  ai_generated: true,
                  order_number: `ORD-${Date.now()}`
                });

              if (!orderError) {
                console.log(`[AI-REPLY] Order created for conversation ${conversation.id}`);
              }
            }
          }
        }
      }

      // Send AI reply
      const aiReply = aiMessage.content || 'عذراً، لم أتمكن من الرد.';

      // Save AI message
      await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: aiReply,
          sender_type: 'agent',
          message_id: `ai_${Date.now()}_${conversation.id}`
        });

      // Mark customer messages as replied
      for (const msg of unrepliedMessages) {
        await supabase
          .from('messages')
          .update({ reply_sent: true })
          .eq('id', msg.id);
      }

      // Send message via channel API
      if (conversation.channel === 'facebook') {
        const { data: fbConfig } = await supabase
          .from('channel_integrations')
          .select('config')
          .eq('channel', 'facebook')
          .single();

        if (fbConfig?.config) {
          const config = fbConfig.config as any;
          const sendUrl = `https://graph.facebook.com/v18.0/me/messages?access_token=${config.page_access_token}`;
          
          await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: conversation.customer_phone },
              message: { text: aiReply }
            })
          });
        }
      }

      processedCount++;
    }

    console.log(`[AUTO-REPLY] Processed ${processedCount} conversations.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount 
      }),
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
