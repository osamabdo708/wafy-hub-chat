import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, newMessage } = await req.json();
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, workspaces:workspace_id(id)')
      .eq('id', conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      throw new Error('Conversation not found');
    }

    // Check if AI is enabled for this conversation
    if (!conversation.ai_enabled) {
      return new Response(JSON.stringify({ message: 'AI not enabled for this conversation' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all products from database with full details
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, description, price, min_negotiable_price, stock, category, category_id, attributes, image_url, gallery_images, categories:category_id(name)')
      .eq('is_active', true)
      .eq('workspace_id', conversation.workspace_id);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    // Fetch shipping methods
    const { data: shippingMethods, error: shippingError } = await supabase
      .from('shipping_methods')
      .select('id, name, description, price, estimated_days, provider')
      .eq('is_active', true)
      .eq('workspace_id', conversation.workspace_id);

    if (shippingError) {
      console.error('Error fetching shipping methods:', shippingError);
    }

    // Fetch payment settings
    const { data: paymentSettings, error: paymentError } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('workspace_id', conversation.workspace_id)
      .maybeSingle();

    if (paymentError) {
      console.error('Error fetching payment settings:', paymentError);
    }

    // Fetch customer's previous orders
    const { data: customerOrders, error: ordersHistoryError } = await supabase
      .from('orders')
      .select('order_number, status, price, created_at, products(name)')
      .eq('customer_phone', conversation.customer_phone)
      .order('created_at', { ascending: false })
      .limit(5);

    if (ordersHistoryError) {
      console.error('Error fetching customer orders:', ordersHistoryError);
    }

    // Helper function to format product attributes
    const formatProductAttributes = (product: any): string => {
      const attrs = product.attributes;
      if (!attrs) return '';
      
      let attrText = '';
      
      if (attrs.colors && attrs.colors.length > 0) {
        attrText += '\nالألوان المتاحة:\n';
        attrs.colors.forEach((color: any) => {
          attrText += `  - ${color.name}`;
          if (color.price) attrText += ` (${color.price} ريال)`;
          attrText += '\n';
          
          if (color.attributes && color.attributes.length > 0) {
            color.attributes.forEach((subAttr: any) => {
              attrText += `    ${subAttr.name}: `;
              const values = subAttr.values.map((v: any) => {
                let valText = v.value;
                if (v.price) valText += ` (+${v.price} ر)`;
                return valText;
              }).join(', ');
              attrText += values + '\n';
            });
          }
        });
      }
      
      if (attrs.custom && attrs.custom.length > 0) {
        attrs.custom.forEach((attr: any) => {
          attrText += `\n${attr.name}: `;
          const values = attr.values.map((v: any) => {
            let valText = v.value;
            if (v.price) valText += ` (+${v.price} ر)`;
            return valText;
          }).join(', ');
          attrText += values;
        });
      }
      
      return attrText;
    };

    // Build products catalog text
    const productsCatalog = products?.map(p => {
      let productInfo = `[معرف: ${p.id}] المنتج: ${p.name}`;
      productInfo += `\nالوصف: ${p.description || 'لا يوجد وصف'}`;
      productInfo += `\nالسعر: ${p.price} ريال`;
      
      if (p.min_negotiable_price) {
        productInfo += `\nالحد الأدنى للتفاوض: ${p.min_negotiable_price} ريال`;
      }
      
      productInfo += `\nالمخزون: ${p.stock > 0 ? `${p.stock} متوفر` : 'غير متوفر'}`;
      productInfo += `\nالفئة: ${p.categories?.name || p.category || 'غير محدد'}`;
      
      const attrText = formatProductAttributes(p);
      if (attrText) {
        productInfo += attrText;
      }
      
      return productInfo;
    }).join('\n\n---\n\n') || 'لا توجد منتجات متاحة';

    // Build shipping methods catalog
    const shippingCatalog = shippingMethods?.map(s => {
      return `[معرف: ${s.id}] ${s.name}: ${s.price} ريال (${s.estimated_days || 'غير محدد'} أيام)${s.description ? ` - ${s.description}` : ''}`;
    }).join('\n') || 'لا توجد طرق شحن متاحة';

    // Build payment methods text
    const paymentMethodsText = [];
    if (paymentSettings?.cod_enabled) {
      paymentMethodsText.push('- الدفع عند الاستلام (cod)');
    }
    if (paymentSettings?.paytabs_enabled) {
      paymentMethodsText.push('- الدفع الإلكتروني عبر بطاقة ائتمان/مدى (electronic)');
    }
    const paymentMethodsCatalog = paymentMethodsText.length > 0 
      ? paymentMethodsText.join('\n') 
      : 'الدفع عند الاستلام فقط';

    // Build customer order history
    const customerOrdersHistory = customerOrders && customerOrders.length > 0
      ? customerOrders.map(o => {
          const productName = o.products?.name || 'منتج غير معروف';
          return `- طلب ${o.order_number}: ${productName} - ${o.price} ريال (${o.status})`;
        }).join('\n')
      : 'لا توجد طلبات سابقة';

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
    }

    // Build conversation context
    const conversationHistory = messages?.map(msg => ({
      role: msg.sender_type === 'customer' ? 'user' : 'assistant',
      content: msg.content
    })) || [];

    const systemPrompt = `أنت مساعد مبيعات ذكي في متجر إلكتروني. مهمتك هي:
1. مساعدة العملاء في العثور على المنتجات المناسبة بناءً على احتياجاتهم
2. الإجابة على أسئلة العملاء حول المنتجات من المعلومات المتاحة فقط
3. إذا سأل العميل عن منتج غير موجود في القائمة، أخبره بأن هذا المنتج غير متوفر في المتجر حالياً
4. عند عرض المنتجات، اذكر الألوان المتاحة وأسعارها إن وجدت
5. اذكر المقاسات أو السمات الأخرى المتاحة لكل لون مع أسعارها الإضافية
6. احسب السعر الإجمالي عند طلب العميل (سعر المنتج + سعر اللون + سعر المقاس + رسوم الشحن)
7. عندما يؤكد العميل رغبته في الطلب، اتبع هذه الخطوات بالترتيب:
   أ. اجمع معلومات العميل (الاسم، الهاتف، البريد الإلكتروني إن أمكن)
   ب. اسأل عن عنوان الشحن الكامل
   ج. اقترح طريقة الشحن المناسبة بناءً على العنوان (إذا كان في نفس المدينة اقترح الأرخص)
   د. اسأل عن طريقة الدفع المفضلة (نقدي عند الاستلام أو إلكتروني)
   هـ. أنشئ الطلب باستخدام أداة create_order
8. كن ودوداً ومحترفاً دائماً
9. يمكنك التفاوض على السعر ضمن الحد الأدنى للتفاوض إن وجد
10. لا تذكر أبداً سعر الشراء أو تكلفة المنتج الداخلية للعميل
11. إذا سأل العميل عن طلباته السابقة، أخبره بها من المعلومات المتاحة
12. احسب الإجمالي الكامل = سعر المنتج + رسوم الشحن

المنتجات المتاحة:
${productsCatalog}

طرق الشحن المتاحة:
${shippingCatalog}

طرق الدفع المتاحة:
${paymentMethodsCatalog}

طلبات العميل السابقة:
${customerOrdersHistory}

معلومات العميل:
الاسم: ${conversation.customer_name || 'غير معروف'}
الهاتف: ${conversation.customer_phone || 'غير معروف'}
البريد الإلكتروني: ${conversation.customer_email || 'غير معروف'}

تعليمات مهمة لإنشاء الطلب:
- يجب اختيار طريقة شحن من القائمة المتاحة
- يجب السؤال عن طريقة الدفع (cod للنقدي، electronic للإلكتروني)
- إذا اختار العميل الدفع الإلكتروني، سيتم إرسال رابط الدفع له تلقائياً
- تأكد من حساب الإجمالي شاملاً رسوم الشحن

تحدث بالعربية دائماً وكن مختصراً وواضحاً في ردودك.`;

    // Define tools for order creation with enhanced parameters
    const tools = [
      {
        type: "function",
        function: {
          name: "create_order",
          description: "إنشاء طلب جديد عندما يؤكد العميل رغبته في الشراء ويوفر جميع التفاصيل المطلوبة (المنتج، العنوان، طريقة الشحن، طريقة الدفع)",
          parameters: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description: "معرف المنتج (UUID)"
              },
              customer_name: {
                type: "string",
                description: "اسم العميل"
              },
              customer_phone: {
                type: "string",
                description: "رقم هاتف العميل"
              },
              customer_email: {
                type: "string",
                description: "البريد الإلكتروني للعميل (اختياري)"
              },
              shipping_address: {
                type: "string",
                description: "عنوان الشحن الكامل"
              },
              shipping_method_id: {
                type: "string",
                description: "معرف طريقة الشحن المختارة (UUID)"
              },
              payment_method: {
                type: "string",
                enum: ["cod", "electronic"],
                description: "طريقة الدفع: cod للدفع عند الاستلام، electronic للدفع الإلكتروني"
              },
              quantity: {
                type: "number",
                description: "الكمية المطلوبة",
                default: 1
              },
              product_price: {
                type: "number",
                description: "سعر المنتج (بدون الشحن)"
              },
              shipping_price: {
                type: "number",
                description: "رسوم الشحن"
              },
              total_price: {
                type: "number",
                description: "السعر الإجمالي شاملاً الشحن"
              },
              notes: {
                type: "string",
                description: "ملاحظات الطلب (اللون، المقاس، أي تفاصيل أخرى)"
              }
            },
            required: ["product_id", "customer_name", "customer_phone", "shipping_address", "shipping_method_id", "payment_method", "total_price"]
          }
        }
      }
    ];

    // Call OpenAI with tools
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: newMessage }
        ],
        tools: tools,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 800
      }),
    });

    const aiData = await response.json();
    console.log('AI Response:', JSON.stringify(aiData, null, 2));

    let aiReply = '';
    const assistantMessage = aiData.choices[0].message;

    // Check if AI wants to call a tool
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCall = assistantMessage.tool_calls[0];
      
      if (toolCall.function.name === 'create_order') {
        const args = JSON.parse(toolCall.function.arguments);
        console.log('Creating order with args:', args);

        // Check product stock
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('id, name, stock, price')
          .eq('id', args.product_id)
          .maybeSingle();

        if (productError || !product) {
          aiReply = 'عذراً، حدث خطأ في العثور على المنتج. يرجى المحاولة مرة أخرى.';
        } else if (product.stock < (args.quantity || 1)) {
          aiReply = `عذراً، الكمية المطلوبة (${args.quantity || 1}) غير متوفرة. المخزون المتاح: ${product.stock}`;
        } else {
          // Get shipping method details
          const { data: shippingMethod } = await supabase
            .from('shipping_methods')
            .select('id, name, price')
            .eq('id', args.shipping_method_id)
            .maybeSingle();

          const quantity = args.quantity || 1;
          const paymentMethod = args.payment_method || 'cod';
          
          // Create the order
          const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert({
              workspace_id: conversation.workspace_id,
              conversation_id: conversationId,
              product_id: args.product_id,
              customer_name: args.customer_name,
              customer_phone: args.customer_phone,
              customer_email: args.customer_email || null,
              shipping_address: args.shipping_address,
              shipping_method_id: args.shipping_method_id,
              price: args.total_price,
              notes: args.notes || `الكمية: ${quantity}`,
              status: 'قيد الانتظار',
              payment_status: paymentMethod === 'cod' ? 'cod' : 'pending',
              ai_generated: true,
              source_platform: conversation.channel
            })
            .select('id, order_number')
            .single();

          if (orderError) {
            console.error('Error creating order:', orderError);
            aiReply = 'عذراً، حدث خطأ في إنشاء الطلب. يرجى المحاولة مرة أخرى.';
          } else {
            // Reduce product stock
            const newStock = product.stock - quantity;
            const { error: stockError } = await supabase
              .from('products')
              .update({ stock: newStock })
              .eq('id', args.product_id);

            if (stockError) {
              console.error('Error updating stock:', stockError);
            }

            const shippingName = shippingMethod?.name || 'شحن عادي';
            const shippingPrice = args.shipping_price || shippingMethod?.price || 0;
            const productPrice = args.product_price || product.price;

            // Handle payment
            if (paymentMethod === 'electronic' && paymentSettings?.paytabs_enabled) {
              // Generate payment link
              try {
                const paymentResponse = await fetch(`${supabaseUrl}/functions/v1/create-paytabs-payment`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`
                  },
                  body: JSON.stringify({ orderId: newOrder.id })
                });
                
                const paymentData = await paymentResponse.json();
                console.log('Payment response:', paymentData);

                if (paymentData.payment_url) {
                  aiReply = `🎉 تم إنشاء طلبك بنجاح!

📋 رقم الطلب: ${newOrder.order_number}
📦 المنتج: ${product.name}
📊 الكمية: ${quantity}
💵 سعر المنتج: ${productPrice} ريال
🚚 الشحن: ${shippingName} (${shippingPrice} ريال)
💰 الإجمالي: ${args.total_price} ريال

💳 رابط الدفع الإلكتروني:
${paymentData.payment_url}

⏰ يرجى إتمام الدفع خلال 24 ساعة لتأكيد طلبك.
📍 سيتم الشحن إلى: ${args.shipping_address}

شكراً لتسوقك معنا! 🛍️`;
                } else {
                  // Payment link generation failed, fallback to COD message
                  aiReply = `🎉 تم إنشاء طلبك بنجاح!

📋 رقم الطلب: ${newOrder.order_number}
📦 المنتج: ${product.name}
📊 الكمية: ${quantity}
💵 سعر المنتج: ${productPrice} ريال
🚚 الشحن: ${shippingName} (${shippingPrice} ريال)
💰 الإجمالي: ${args.total_price} ريال

⚠️ تعذر إنشاء رابط الدفع الإلكتروني. سيتم التواصل معك لترتيب الدفع.
📍 سيتم الشحن إلى: ${args.shipping_address}

شكراً لتسوقك معنا! 🛍️`;
                }
              } catch (paymentErr) {
                console.error('Payment generation error:', paymentErr);
                aiReply = `🎉 تم إنشاء طلبك بنجاح!

📋 رقم الطلب: ${newOrder.order_number}
📦 المنتج: ${product.name}
📊 الكمية: ${quantity}
💵 سعر المنتج: ${productPrice} ريال
🚚 الشحن: ${shippingName} (${shippingPrice} ريال)
💰 الإجمالي: ${args.total_price} ريال

⚠️ تعذر إنشاء رابط الدفع الإلكتروني. سيتم التواصل معك لترتيب الدفع.
📍 سيتم الشحن إلى: ${args.shipping_address}

شكراً لتسوقك معنا! 🛍️`;
              }
            } else {
              // COD order confirmation
              aiReply = `🎉 تم إنشاء طلبك بنجاح!

📋 رقم الطلب: ${newOrder.order_number}
📦 المنتج: ${product.name}
📊 الكمية: ${quantity}
💵 سعر المنتج: ${productPrice} ريال
🚚 الشحن: ${shippingName} (${shippingPrice} ريال)
💰 الإجمالي: ${args.total_price} ريال

💵 طريقة الدفع: الدفع عند الاستلام
📍 سيتم الشحن إلى: ${args.shipping_address}

سيتم التواصل معك قريباً لتأكيد الطلب.
شكراً لتسوقك معنا! 🛍️`;
            }
          }
        }
      }
    } else {
      // Normal response without tool call
      aiReply = assistantMessage.content;
    }

    console.log('AI Reply:', aiReply);

    // Save AI message to database
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: aiReply,
        sender_type: 'agent',
        sender_id: null
      });

    if (insertError) {
      console.error('Error saving AI message:', insertError);
    }

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Send message to the channel (Facebook, WhatsApp, etc.)
    const channel = conversation.channel;
    
    if (channel === 'facebook') {
      const { data: integration } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'facebook')
        .eq('workspace_id', conversation.workspace_id)
        .maybeSingle();

      if (integration?.config?.page_access_token) {
        const recipientId = conversation.customer_phone;
        
        await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.config.page_access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: aiReply }
          })
        });
      }
    } else if (channel === 'whatsapp') {
      const { data: integration } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'whatsapp')
        .eq('workspace_id', conversation.workspace_id)
        .maybeSingle();

      if (integration?.config?.phone_number_id && integration?.config?.access_token) {
        await fetch(`https://graph.facebook.com/v18.0/${integration.config.phone_number_id}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.config.access_token}`,
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
    } else if (channel === 'instagram') {
      const { data: integration } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'instagram')
        .eq('workspace_id', conversation.workspace_id)
        .maybeSingle();

      if (integration?.config?.page_access_token) {
        const recipientId = conversation.customer_phone;
        
        await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.config.page_access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: aiReply }
          })
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: aiReply 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-chat-handler:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
