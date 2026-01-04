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
      .select('id, customer_name, customer_phone, customer_email, thread_id, platform, channel, ai_enabled, workspace_id')
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

      // Check if the most recent unreplied message is at least 6 seconds old (wait for customer to finish typing)
      const mostRecentMessage = unrepliedMessages[unrepliedMessages.length - 1];
      const messageAge = Date.now() - new Date(mostRecentMessage.created_at).getTime();
      const WAIT_TIME = 6 * 1000;

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

        // Get products for this workspace with full details
        const { data: products } = await supabase
          .from('products')
          .select('id, name, description, price, stock, attributes, min_negotiable_price')
          .eq('workspace_id', conversation.workspace_id)
          .eq('is_active', true);

        // Get shipping methods
        const { data: shippingMethods } = await supabase
          .from('shipping_methods')
          .select('id, name, description, price, estimated_days')
          .eq('workspace_id', conversation.workspace_id)
          .eq('is_active', true);

        // Get payment settings
        const { data: paymentSettings } = await supabase
          .from('payment_settings')
          .select('*')
          .eq('workspace_id', conversation.workspace_id)
          .maybeSingle();

        // Get customer's previous orders
        const { data: customerOrders } = await supabase
          .from('orders')
          .select('order_number, status, price, created_at')
          .eq('customer_phone', conversation.customer_phone)
          .order('created_at', { ascending: false })
          .limit(3);

        // Get last 20 messages for context
        const { data: contextMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(20);

        const messageHistory = contextMessages?.reverse().map(m => ({
          role: m.sender_type === 'customer' ? 'user' : 'assistant',
          content: m.content
        })) || [];

        // Build products context with attributes
        const productsContext = products?.map(p => {
          let info = `[${p.id}] ${p.name}: ${p.price}ر`;
          if (p.stock !== null) info += ` (مخزون: ${p.stock})`;
          
          const attrs = p.attributes as any;
          if (attrs?.colors?.length > 0) {
            info += `\n   ألوان: ${attrs.colors.map((c: any) => {
              let colorInfo = c.name;
              if (c.price) colorInfo += ` (+${c.price}ر)`;
              return colorInfo;
            }).join('، ')}`;
            
            // Add sizes for each color if available
            for (const color of attrs.colors) {
              if (color.attributes?.length > 0) {
                for (const subAttr of color.attributes) {
                  if (subAttr.name?.includes('مقاس') || subAttr.name?.includes('size')) {
                    info += `\n   مقاسات ${color.name}: ${subAttr.values.map((v: any) => v.value).join('، ')}`;
                  }
                }
              }
            }
          }
          
          return info;
        }).join('\n') || 'لا توجد منتجات';

        // Build shipping context
        const shippingContext = shippingMethods?.map(s => 
          `[${s.id}] ${s.name}: ${s.price}ر (${s.estimated_days || '؟'} يوم)`
        ).join('\n') || 'شحن مجاني';

        // Payment methods
        const paymentMethods = [];
        if (paymentSettings?.cod_enabled !== false) paymentMethods.push('نقدي (cod)');
        if (paymentSettings?.paytabs_enabled) paymentMethods.push('إلكتروني (electronic)');
        const paymentContext = paymentMethods.length > 0 ? paymentMethods.join(' أو ') : 'نقدي فقط';

        // Customer history
        const historyContext = customerOrders && customerOrders.length > 0 
          ? customerOrders.map(o => `#${o.order_number} (${o.status})`).join('، ')
          : '';

        // Human-like prompt with full context
        const systemPrompt = `أنت مساعد مبيعات ودود وذكي. تتكلم بشكل طبيعي مثل الإنسان.

📦 المنتجات المتوفرة:
${productsContext}

🚚 طرق الشحن:
${shippingContext}

💳 طرق الدفع: ${paymentContext}

${historyContext ? `📜 طلبات العميل السابقة: ${historyContext}` : ''}

👤 العميل: ${conversation.customer_name || 'زائر'} | هاتف: ${conversation.customer_phone || 'غير معروف'}

⚠️ قواعد مهمة:
1. ردود قصيرة (جملة أو جملتين)
2. إذا المنتج له ألوان/مقاسات، اسأل عنها واحدة واحدة
3. قبل إنشاء الطلب، لازم تجمع: المنتج + اللون + المقاس + العنوان + طريقة الشحن + طريقة الدفع
4. لما تكون كل المعلومات جاهزة، استخدم create_order
5. بعد الطلب الناجح، اشكر العميل وأرسل تفاصيل الطلب

💬 تدفق المحادثة:
- العميل يسأل عن منتج ← أجب عن السعر والمواصفات
- العميل يريد يطلب ← اسأل: "تمام! أي لون تحب؟"
- العميل يختار لون ← اسأل: "ممتاز! أي مقاس؟"
- العميل يختار مقاس ← اسأل: "وين أوصلك الطلب؟"
- العميل يعطي عنوان ← اسأل: "تحب دفع ${paymentContext}؟"
- العميل يختار دفع ← أنشئ الطلب بـ create_order

مثال محادثة طبيعية:
العميل: "أبغى حذاء"
أنت: "عندنا حذاء اديداس بـ150ر! أي لون يعجبك؟ 😊"
العميل: "أسود"
أنت: "تمام أسود! أي مقاس؟"
العميل: "42"
أنت: "ممتاز! وين أوصلك؟"
العميل: "الرياض حي النخيل"
أنت: "تمام! تحب تدفع نقدي عند الاستلام أو إلكتروني؟"
العميل: "نقدي"
أنت: [تستخدم create_order وترسل التأكيد]`;

        // Define order creation tool
        const tools = [
          {
            type: "function",
            function: {
              name: "create_order",
              description: "أنشئ طلب جديد بعد جمع كل المعلومات المطلوبة من العميل",
              parameters: {
                type: "object",
                properties: {
                  product_id: { type: "string", description: "معرف المنتج UUID" },
                  product_name: { type: "string", description: "اسم المنتج" },
                  selected_color: { type: "string", description: "اللون المختار" },
                  selected_size: { type: "string", description: "المقاس المختار" },
                  quantity: { type: "number", description: "الكمية" },
                  shipping_address: { type: "string", description: "عنوان التوصيل الكامل" },
                  shipping_method_id: { type: "string", description: "معرف طريقة الشحن UUID" },
                  payment_method: { type: "string", enum: ["cod", "electronic"], description: "طريقة الدفع" },
                  product_price: { type: "number", description: "سعر المنتج" },
                  extras_price: { type: "number", description: "سعر الإضافات (لون/مقاس)" },
                  shipping_price: { type: "number", description: "سعر الشحن" },
                  total_price: { type: "number", description: "الإجمالي" },
                  notes: { type: "string", description: "ملاحظات إضافية" }
                },
                required: ["product_id", "shipping_address", "shipping_method_id", "payment_method", "total_price"]
              }
            }
          }
        ];

        // Call OpenAI with tools
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
            tools: tools,
            tool_choice: "auto",
            temperature: 0.8,
            max_tokens: 300
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[AI-REPLY] OpenAI error: ${response.status}`, errorText);
          await supabase.from('messages').update({ reply_sent: false }).in('id', messageIds);
          continue;
        }

        const aiData = await response.json();
        console.log('[AI-REPLY] AI Response:', JSON.stringify(aiData, null, 2));

        let aiReply = '';
        const assistantMessage = aiData.choices?.[0]?.message;

        // Check if AI wants to create an order
        if (assistantMessage?.tool_calls?.length > 0) {
          const toolCall = assistantMessage.tool_calls[0];
          
          if (toolCall.function.name === 'create_order') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              console.log('[AI-REPLY] Creating order with args:', args);

              // Get product details
              const { data: product } = await supabase
                .from('products')
                .select('id, name, stock, price')
                .eq('id', args.product_id)
                .maybeSingle();

              if (!product) {
                aiReply = 'معليش ما لقيت المنتج، ممكن تحدده مرة ثانية؟ 🤔';
              } else if (product.stock < (args.quantity || 1)) {
                aiReply = `للأسف نفذ المخزون 😔 متبقي ${product.stock} فقط`;
              } else {
                // Get shipping method
                const { data: shippingMethod } = await supabase
                  .from('shipping_methods')
                  .select('id, name, price')
                  .eq('id', args.shipping_method_id)
                  .maybeSingle();

                const quantity = args.quantity || 1;
                
                // Build order notes
                let orderNotes = '';
                if (args.selected_color) orderNotes += `اللون: ${args.selected_color}\n`;
                if (args.selected_size) orderNotes += `المقاس: ${args.selected_size}\n`;
                if (args.notes) orderNotes += args.notes;
                orderNotes += `\nالكمية: ${quantity}`;
                orderNotes += `\n(تم الطلب بواسطة الذكاء الاصطناعي)`;

                // Create the order
                const { data: newOrder, error: orderError } = await supabase
                  .from('orders')
                  .insert({
                    workspace_id: conversation.workspace_id,
                    conversation_id: conversation.id,
                    product_id: args.product_id,
                    customer_name: conversation.customer_name || 'عميل',
                    customer_phone: conversation.customer_phone,
                    customer_email: conversation.customer_email || null,
                    shipping_address: args.shipping_address,
                    shipping_method_id: args.shipping_method_id,
                    price: args.total_price,
                    notes: orderNotes.trim(),
                    status: 'قيد الانتظار',
                    payment_status: args.payment_method === 'cod' ? 'cod' : 'pending',
                    ai_generated: true,
                    source_platform: conversation.channel
                  })
                  .select('id, order_number')
                  .single();

                if (orderError) {
                  console.error('[AI-REPLY] Order creation error:', orderError);
                  aiReply = 'صار مشكلة بسيطة، ممكن نحاول مرة ثانية؟ 😅';
                } else {
                  console.log('[AI-REPLY] ✅ Order created:', newOrder.order_number);

                  // Reduce stock
                  await supabase
                    .from('products')
                    .update({ stock: product.stock - quantity })
                    .eq('id', args.product_id);

                  const shippingName = shippingMethod?.name || 'توصيل';
                  const shippingPrice = args.shipping_price || shippingMethod?.price || 0;

                  // Handle electronic payment
                  if (args.payment_method === 'electronic' && paymentSettings?.paytabs_enabled) {
                    try {
                      const paymentResponse = await fetch(`${supabaseUrl}/functions/v1/create-paytabs-payment`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${supabaseKey}`
                        },
                        body: JSON.stringify({ orderId: newOrder.id })
                      });
                      
                      const paymentData = await paymentResponse.json();

                      if (paymentData.payment_url) {
                        aiReply = `🎉 تم طلبك بنجاح!

📋 رقم الطلب: ${newOrder.order_number}
📦 ${product.name}${args.selected_color ? ` (${args.selected_color})` : ''}${args.selected_size ? ` - مقاس ${args.selected_size}` : ''}
🚚 ${shippingName}
💰 الإجمالي: ${args.total_price}ر

💳 ادفع من هنا:
${paymentData.payment_url}

⏰ يرجى الدفع خلال 24 ساعة`;
                      } else {
                        aiReply = `تم طلبك #${newOrder.order_number}! 🎉 لكن صار مشكلة برابط الدفع، راح نتواصل معك قريباً 📞`;
                      }
                    } catch (paymentError) {
                      console.error('[AI-REPLY] Payment error:', paymentError);
                      aiReply = `تم طلبك #${newOrder.order_number}! 🎉 راح نتواصل معك لإتمام الدفع 📞`;
                    }
                  } else {
                    // COD confirmation
                    aiReply = `🎉 تم طلبك بنجاح!

📋 رقم الطلب: ${newOrder.order_number}
📦 ${product.name}${args.selected_color ? ` (${args.selected_color})` : ''}${args.selected_size ? ` - مقاس ${args.selected_size}` : ''}
📍 ${args.shipping_address}
🚚 ${shippingName}
💰 الإجمالي: ${args.total_price}ر
💵 الدفع عند الاستلام

شكراً لك! راح نتواصل معك قريباً 🛍️✨`;
                  }
                }
              }
            } catch (parseError) {
              console.error('[AI-REPLY] Tool parse error:', parseError);
              aiReply = 'معليش صار خطأ، ممكن نحاول مرة ثانية؟';
            }
          }
        } else {
          // Regular text reply
          aiReply = assistantMessage?.content || 'أهلاً! كيف أقدر أساعدك؟ 😊';
        }

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
        await sendToChannel(supabase, conversation, aiReply);

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

// Helper function to send message to the appropriate channel
async function sendToChannel(supabase: any, conversation: any, message: string) {
  try {
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
            message: { text: message }
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
          const sendResponse = await fetch(`https://graph.facebook.com/v18.0/${config.phone_number_id}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: conversation.customer_phone,
              type: 'text',
              text: { body: message }
            })
          });

          if (!sendResponse.ok) {
            console.error(`[AI-REPLY] WhatsApp send error:`, await sendResponse.text());
          } else {
            console.log(`[AI-REPLY] ✅ Sent to whatsapp`);
          }
        }
      }
    }
  } catch (error) {
    console.error('[AI-REPLY] Channel send error:', error);
  }
}
