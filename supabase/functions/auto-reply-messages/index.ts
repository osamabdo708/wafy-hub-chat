import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse product attributes DYNAMICALLY - looks at what exists, no hardcoded checks
function parseProductAttributes(product: any) {
  const attrs = product.attributes as any;
  const result: {
    hasVariants: boolean;
    variants: {
      name: string;
      type: 'color' | 'subAttribute' | 'custom';
      options: {
        value: string;
        price: number;
        subVariants?: { name: string; options: string[] }[];
      }[];
    }[];
  } = { hasVariants: false, variants: [] };

  if (!attrs) return result;

  // 1. Colors (if exists)
  if (attrs.colors && Array.isArray(attrs.colors) && attrs.colors.length > 0) {
    result.hasVariants = true;
    result.variants.push({
      name: 'اللون',
      type: 'color',
      options: attrs.colors.map((c: any) => {
        // Get ALL sub-attributes for this color dynamically
        const subVariants: { name: string; options: string[] }[] = [];
        if (c.attributes && Array.isArray(c.attributes)) {
          for (const subAttr of c.attributes) {
            if (subAttr.values && Array.isArray(subAttr.values) && subAttr.values.length > 0) {
              subVariants.push({
                name: subAttr.name,
                options: subAttr.values.map((v: any) => v.value)
              });
            }
          }
        }
        return {
          value: c.name,
          price: c.price || product.price,
          subVariants: subVariants.length > 0 ? subVariants : undefined
        };
      })
    });
  }

  // 2. Custom attributes
  if (attrs.custom && Array.isArray(attrs.custom) && attrs.custom.length > 0) {
    result.hasVariants = true;
    for (const custom of attrs.custom) {
      if (custom.values && Array.isArray(custom.values) && custom.values.length > 0) {
        result.variants.push({
          name: custom.name,
          type: 'custom',
          options: custom.values.map((v: any) => ({
            value: v.value,
            price: v.price || 0
          }))
        });
      }
    }
  }

  return result;
}

// Build product context string dynamically
function buildProductContext(products: any[]) {
  if (!products || products.length === 0) return 'لا توجد منتجات';

  return products.map(p => {
    const parsed = parseProductAttributes(p);
    let info = `[${p.id}] ${p.name} - المخزون: ${p.stock !== null ? (p.stock > 0 ? p.stock : '❌نفذ') : 'متوفر'}`;

    if (!parsed.hasVariants) {
      // No variants - just show base price
      info += `\n   السعر: ${p.price}₪`;
    } else {
      // Has variants - show them dynamically
      info += '\n   المتغيرات المتوفرة:';
      
      for (const variant of parsed.variants) {
        if (variant.type === 'color') {
          info += `\n   • ${variant.name}: `;
          info += variant.options.map(o => `${o.value} (${o.price}₪)`).join('، ');

          // Show sub-variants for each color
          for (const option of variant.options) {
            if (option.subVariants && option.subVariants.length > 0) {
              for (const sub of option.subVariants) {
                info += `\n     ↳ ${sub.name} لـ${option.value}: ${sub.options.join('، ')}`;
              }
            }
          }
        } else {
          // Custom attribute
          info += `\n   • ${variant.name}: `;
          info += variant.options.map(o =>
            o.price > 0 ? `${o.value} (+${o.price}₪)` : o.value
          ).join('، ');
        }
      }
    }

    return info;
  }).join('\n\n');
}

// Try to acquire DB lock for conversation
async function acquireLock(supabase: any, conversationId: string): Promise<boolean> {
  try {
    await supabase
      .from('ai_processing_locks')
      .delete()
      .lt('expires_at', new Date().toISOString());

    const { error } = await supabase
      .from('ai_processing_locks')
      .insert({
        conversation_id: conversationId,
        locked_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30000).toISOString()
      });

    if (error) {
      console.log(`[AI-REPLY] Lock exists for ${conversationId}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[AI-REPLY] Lock error:', e);
    return false;
  }
}

// Release DB lock
async function releaseLock(supabase: any, conversationId: string) {
  try {
    await supabase
      .from('ai_processing_locks')
      .delete()
      .eq('conversation_id', conversationId);
  } catch (e) {
    console.error('[AI-REPLY] Release lock error:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const publicAppUrl = 'https://wafy-hub-chat.lovable.app';

    console.log('[AUTO-REPLY] Starting AI auto-reply check...');

    // Find conversations with AI enabled
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
      // Get unreplied messages
      const { data: unrepliedMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'customer')
        .eq('reply_sent', false)
        .eq('is_old', false)
        .order('created_at', { ascending: true });

      if (!unrepliedMessages || unrepliedMessages.length === 0) continue;

      // Wait for customer to finish typing (6 seconds)
      const mostRecentMessage = unrepliedMessages[unrepliedMessages.length - 1];
      const messageAge = Date.now() - new Date(mostRecentMessage.created_at).getTime();
      const WAIT_TIME = 6000;

      if (messageAge < WAIT_TIME) {
        console.log(`[AI-REPLY] Waiting for ${conversation.id} - message only ${Math.floor(messageAge / 1000)}s old`);
        continue;
      }

      // Try to acquire DB lock
      const lockAcquired = await acquireLock(supabase, conversation.id);
      if (!lockAcquired) {
        console.log(`[AI-REPLY] Skipping ${conversation.id} - locked`);
        continue;
      }

      try {
        // Double-check no AI message was sent in last 5 seconds
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
            console.log(`[AI-REPLY] Skipping ${conversation.id} - AI replied recently`);
            continue;
          }
        }

        // Mark messages as replied FIRST
        const messageIds = unrepliedMessages.map(m => m.id);
        await supabase
          .from('messages')
          .update({ reply_sent: true })
          .in('id', messageIds);

        console.log(`[AI-REPLY] Processing ${conversation.id} with ${unrepliedMessages.length} messages`);

        // Get products
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

        // Get message history
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

        // Build dynamic product context
        const productsContext = buildProductContext(products || []);

        // Build shipping context
        const shippingContext = shippingMethods?.map(s =>
          `[${s.id}] ${s.name}: ${s.price}₪ (${s.estimated_days || '؟'} يوم)`
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

        // DYNAMIC system prompt - no hardcoded attribute checks
        const systemPrompt = `أنت مساعد مبيعات ودود وطبيعي. تتكلم كأنك إنسان حقيقي.

📦 المنتجات:
${productsContext}

🚚 الشحن:
${shippingContext}

💳 الدفع: ${paymentContext}

${historyContext ? `📜 طلبات سابقة: ${historyContext}` : ''}

👤 بيانات العميل الحالية:
- الاسم: ${conversation.customer_name || 'غير معروف'}
- الهاتف: ${conversation.customer_phone || 'غير معروف'}

⚠️ قواعد المتغيرات (مهم جداً):
1. انظر لكل منتج وشوف "المتغيرات المتوفرة" تحته
2. اسأل فقط عن المتغيرات الموجودة في وصف المنتج
3. لا تسأل عن مقاس أو حجم أو نوع إذا غير موجود في المنتج
4. سعر اللون = السعر النهائي للمنتج (ليس إضافة)
5. إذا اللون له متغيرات فرعية (↳)، اسأل عنها بعد اختيار اللون

📋 تدفق الطلب الكامل (اتبعه بالترتيب):
1. العميل يسأل عن منتج ← أخبره بالسعر والخيارات المتوفرة
2. إذا يريد يطلب وفيه متغيرات ← اسأل عنها واحدة واحدة
3. بعد المتغيرات ← "ممكن اسمك الكريم؟" (إذا غير معروف)
4. بعد الاسم ← "رقم الجوال؟" (إذا غير معروف)
5. بعد الهاتف ← "وين أوصلك الطلب؟"
6. بعد العنوان ← اعرض طرق الشحن
7. بعد الشحن ← "نقدي أو إلكتروني؟"
8. بعد الدفع ← create_order

💬 أمثلة:

منتج بألوان فقط (بدون مقاسات):
العميل: "أبغى الحذاء"
أنت: "عندنا اديداس! الألوان: أبيض (150₪)، بيج (170₪). أي لون؟"
العميل: "بيج"
أنت: "بيج ممتاز! ممكن اسمك الكريم؟"

منتج بألوان ومقاسات:
العميل: "أبغى التيشيرت"
أنت: "عندنا تيشيرت! الألوان: أبيض، أسود. أي لون؟"
العميل: "أسود"
أنت: "أسود! المقاسات: S، M، L. أي مقاس؟"
العميل: "L"
أنت: "تمام L! ممكن اسمك؟"

منتج بدون متغيرات:
العميل: "أبغى الكتاب"
أنت: "الكتاب بـ50₪! ممكن اسمك الكريم؟"`;

        // Define order creation tool
        const tools = [{
          type: "function",
          function: {
            name: "create_order",
            description: "أنشئ طلب بعد جمع: المنتج + المتغيرات (إذا موجودة) + الاسم + الهاتف + العنوان + الشحن + الدفع",
            parameters: {
              type: "object",
              properties: {
                product_id: { type: "string", description: "معرف المنتج UUID" },
                product_name: { type: "string", description: "اسم المنتج" },
                selected_variants: {
                  type: "object",
                  description: "المتغيرات المختارة ديناميكياً: {اللون: 'أبيض', المقاس: '42', النوع: 'قطن'...}",
                  additionalProperties: { type: "string" }
                },
                quantity: { type: "number", description: "الكمية", default: 1 },
                customer_name: { type: "string", description: "اسم العميل (مطلوب)" },
                customer_phone: { type: "string", description: "رقم هاتف العميل (مطلوب)" },
                shipping_address: { type: "string", description: "عنوان التوصيل" },
                shipping_method_id: { type: "string", description: "معرف طريقة الشحن UUID" },
                payment_method: { type: "string", enum: ["cod", "electronic"], description: "طريقة الدفع" },
                final_product_price: { type: "number", description: "سعر المنتج النهائي (سعر اللون المختار)" },
                shipping_price: { type: "number", description: "سعر الشحن" },
                total_price: { type: "number", description: "الإجمالي" }
              },
              required: ["product_id", "customer_name", "customer_phone", "shipping_address", "shipping_method_id", "payment_method", "total_price"]
            }
          }
        }];

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
            tools: tools,
            tool_choice: "auto",
            temperature: 0.7,
            max_tokens: 400
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
                .select('id, name, stock, price, attributes')
                .eq('id', args.product_id)
                .maybeSingle();

              if (!product) {
                aiReply = 'معليش ما لقيت المنتج، ممكن تحدده مرة ثانية؟ 🤔';
              } else {
                const quantity = args.quantity || 1;

                if (product.stock !== null && product.stock < quantity) {
                  aiReply = `للأسف نفذ المخزون 😔 متبقي ${product.stock} فقط`;
                } else {
                  // Calculate correct price based on selected variant
                  let finalProductPrice = args.final_product_price || product.price;

                  // If color was selected, get the color's price
                  if (args.selected_variants?.اللون) {
                    const parsed = parseProductAttributes(product);
                    const colorVariant = parsed.variants.find(v => v.name === 'اللون');
                    if (colorVariant) {
                      const selectedColor = colorVariant.options.find(o => o.value === args.selected_variants.اللون);
                      if (selectedColor) {
                        finalProductPrice = selectedColor.price;
                      }
                    }
                  }

                  // Get shipping method
                  const { data: shippingMethod } = await supabase
                    .from('shipping_methods')
                    .select('id, name, price')
                    .eq('id', args.shipping_method_id)
                    .maybeSingle();

                  const shippingPrice = args.shipping_price || shippingMethod?.price || 0;
                  const totalPrice = (finalProductPrice * quantity) + shippingPrice;

                  // Build order notes from selected_variants dynamically
                  let orderNotes = '';
                  if (args.selected_variants) {
                    for (const [key, value] of Object.entries(args.selected_variants)) {
                      orderNotes += `${key}: ${value}\n`;
                    }
                  }
                  orderNotes += `الكمية: ${quantity}`;
                  orderNotes += `\n(تم الطلب بواسطة الذكاء الاصطناعي)`;

                  // Create the order
                  const { data: newOrder, error: orderError } = await supabase
                    .from('orders')
                    .insert({
                      workspace_id: conversation.workspace_id,
                      conversation_id: conversation.id,
                      product_id: args.product_id,
                      customer_name: args.customer_name || conversation.customer_name || 'عميل',
                      customer_phone: args.customer_phone || conversation.customer_phone,
                      customer_email: conversation.customer_email || null,
                      shipping_address: args.shipping_address,
                      shipping_method_id: args.shipping_method_id,
                      price: totalPrice,
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

                    // Update conversation with customer data
                    await supabase
                      .from('conversations')
                      .update({
                        customer_name: args.customer_name || conversation.customer_name,
                        customer_phone: args.customer_phone || conversation.customer_phone
                      })
                      .eq('id', conversation.id);

                    // Reduce stock
                    if (product.stock !== null) {
                      await supabase
                        .from('products')
                        .update({ stock: product.stock - quantity })
                        .eq('id', args.product_id);
                    }

                    const shippingName = shippingMethod?.name || 'توصيل';

                    // Build variants text for confirmation
                    let variantsText = '';
                    if (args.selected_variants) {
                      const variants = Object.entries(args.selected_variants)
                        .map(([k, v]) => `${v}`)
                        .join(' - ');
                      if (variants) variantsText = ` (${variants})`;
                    }

                    // Invoice URL
                    const invoiceUrl = `${publicAppUrl}/pay/${newOrder.order_number}`;

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
👤 ${args.customer_name} - ${args.customer_phone}
📦 ${product.name}${variantsText}
📍 ${args.shipping_address}
🚚 ${shippingName}: ${shippingPrice}₪
💰 الإجمالي: ${totalPrice}₪

💳 ادفع من هنا:
${paymentData.payment_url}

🧾 الفاتورة: ${invoiceUrl}

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
👤 ${args.customer_name} - ${args.customer_phone}
📦 ${product.name}${variantsText}
📍 ${args.shipping_address}
🚚 ${shippingName}: ${shippingPrice}₪
💰 الإجمالي: ${totalPrice}₪
💵 الدفع عند الاستلام

🧾 الفاتورة: ${invoiceUrl}

شكراً لك! ✨`;
                    }
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
        await releaseLock(supabase, conversation.id);
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
