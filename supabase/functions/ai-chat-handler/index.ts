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
      .select('*, workspaces:workspace_id(id, name)')
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

    // Helper function to format product attributes for AI understanding
    const formatProductAttributes = (product: any): string => {
      const attrs = product.attributes;
      if (!attrs) return '';
      
      let attrText = '';
      
      if (attrs.colors && attrs.colors.length > 0) {
        attrText += '\n🎨 الألوان: ';
        attrText += attrs.colors.map((c: any) => {
          let colorInfo = c.name;
          if (c.price) colorInfo += ` (+${c.price}ر)`;
          return colorInfo;
        }).join('، ');
        
        // Add sizes per color if exist
        for (const color of attrs.colors) {
          if (color.attributes && color.attributes.length > 0) {
            for (const subAttr of color.attributes) {
              if (subAttr.name.includes('مقاس') || subAttr.name.includes('حجم') || subAttr.name.includes('size')) {
                attrText += `\n📏 المقاسات المتاحة لـ${color.name}: `;
                attrText += subAttr.values.map((v: any) => {
                  let sizeInfo = v.value;
                  if (v.price) sizeInfo += ` (+${v.price}ر)`;
                  return sizeInfo;
                }).join('، ');
              }
            }
          }
        }
      }
      
      if (attrs.custom && attrs.custom.length > 0) {
        for (const attr of attrs.custom) {
          attrText += `\n${attr.name}: `;
          attrText += attr.values.map((v: any) => {
            let valInfo = v.value;
            if (v.price) valInfo += ` (+${v.price}ر)`;
            return valInfo;
          }).join('، ');
        }
      }
      
      return attrText;
    };

    // Check if product has attributes that need selection
    const hasProductAttributes = (product: any): boolean => {
      const attrs = product?.attributes;
      if (!attrs) return false;
      return (attrs.colors && attrs.colors.length > 0) || (attrs.custom && attrs.custom.length > 0);
    };

    // Build products catalog text
    const productsCatalog = products?.map(p => {
      let productInfo = `[ID: ${p.id}] ${p.name}`;
      productInfo += ` - ${p.price}ر`;
      if (p.description) productInfo += ` | ${p.description.substring(0, 60)}`;
      productInfo += ` | مخزون: ${p.stock > 0 ? p.stock : '❌نفذ'}`;
      
      const attrText = formatProductAttributes(p);
      if (attrText) {
        productInfo += attrText;
      }
      
      return productInfo;
    }).join('\n') || 'لا توجد منتجات';

    // Build shipping methods catalog
    const shippingCatalog = shippingMethods?.map(s => {
      return `[ID: ${s.id}] ${s.name}: ${s.price}ر (${s.estimated_days || '؟'} يوم)`;
    }).join('\n') || 'شحن مجاني';

    // Build payment methods text
    const paymentMethodsText = [];
    if (paymentSettings?.cod_enabled !== false) {
      paymentMethodsText.push('نقدي عند الاستلام (cod)');
    }
    if (paymentSettings?.paytabs_enabled) {
      paymentMethodsText.push('دفع إلكتروني (electronic)');
    }
    const paymentMethodsCatalog = paymentMethodsText.length > 0 
      ? paymentMethodsText.join(' أو ') 
      : 'نقدي فقط';

    // Build customer order history
    const customerOrdersHistory = customerOrders && customerOrders.length > 0
      ? customerOrders.map(o => `${o.order_number}: ${o.products?.name || '؟'} (${o.status})`).join(' | ')
      : '';

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(25);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
    }

    // Build conversation context
    const conversationHistory = messages?.map(msg => ({
      role: msg.sender_type === 'customer' ? 'user' : 'assistant',
      content: msg.content
    })) || [];

    // Human-like AI personality prompt
    const systemPrompt = `أنت مساعد مبيعات ودود وطبيعي. تتكلم كأنك إنسان حقيقي مش روبوت.

🎯 شخصيتك:
- ودود ومرح، استخدم إيموجي باعتدال 😊
- ردودك قصيرة (جملة أو جملتين)، ما تكتب مقالات
- تفهم اللهجات العربية المختلفة
- لا تكرر نفسك أبداً
- لا تسأل أسئلة كثيرة مرة وحدة

📦 المنتجات:
${productsCatalog}

🚚 الشحن:
${shippingCatalog}

💳 الدفع: ${paymentMethodsCatalog}

${customerOrdersHistory ? `📜 طلبات العميل السابقة: ${customerOrdersHistory}` : ''}

👤 العميل: ${conversation.customer_name || 'زائر'} ${conversation.customer_phone ? `(${conversation.customer_phone})` : ''}

⚠️ قواعد مهمة جداً:
1. إذا المنتج له ألوان أو مقاسات، لازم تسأل العميل عنها قبل الطلب
2. لا تنشئ طلب بدون ما تعرف: اللون (إذا متوفر)، المقاس (إذا متوفر)، العنوان الكامل
3. احسب السعر = سعر المنتج + سعر اللون + سعر المقاس + الشحن
4. اسأل طريقة الدفع (نقدي أو إلكتروني) قبل تأكيد الطلب
5. إذا العميل ما حدد منتج واضح، اسأله بالضبط شو يبغى

💬 أسلوب الرد:
- عميل يسأل عن منتج → اعرض السعر والمواصفات بشكل بسيط
- عميل يقول "أبغى أطلب" → اسأل: "تمام! أي لون تفضل؟" (إذا في ألوان)
- عميل يعطي عنوان → اقترح طريقة الشحن المناسبة
- عميل جاهز → أنشئ الطلب واشكره

مثال على رد طبيعي:
❌ خطأ: "مرحباً بك! كيف يمكنني مساعدتك اليوم؟ لدينا منتجات رائعة..."
✅ صح: "أهلاً! شو تحب أساعدك فيه؟ 😊"`;

    // Define tools for order creation with enhanced parameters
    const tools = [
      {
        type: "function",
        function: {
          name: "create_order",
          description: "أنشئ طلب فقط بعد ما تتأكد من: المنتج + اللون/المقاس (إذا موجود) + العنوان + طريقة الشحن + طريقة الدفع",
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
                description: "رقم الهاتف"
              },
              customer_email: {
                type: "string",
                description: "الإيميل (اختياري)"
              },
              shipping_address: {
                type: "string",
                description: "العنوان الكامل"
              },
              shipping_method_id: {
                type: "string",
                description: "معرف طريقة الشحن (UUID)"
              },
              payment_method: {
                type: "string",
                enum: ["cod", "electronic"],
                description: "طريقة الدفع"
              },
              quantity: {
                type: "number",
                description: "الكمية (افتراضي 1)"
              },
              selected_color: {
                type: "string",
                description: "اللون المختار (مطلوب إذا المنتج له ألوان)"
              },
              selected_size: {
                type: "string",
                description: "المقاس المختار (مطلوب إذا المنتج له مقاسات)"
              },
              product_price: {
                type: "number",
                description: "سعر المنتج الأساسي"
              },
              extras_price: {
                type: "number",
                description: "سعر الإضافات (لون + مقاس)"
              },
              shipping_price: {
                type: "number",
                description: "سعر الشحن"
              },
              total_price: {
                type: "number",
                description: "الإجمالي (المنتج + الإضافات + الشحن)"
              },
              notes: {
                type: "string",
                description: "ملاحظات (اللون، المقاس، تفاصيل أخرى)"
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
        temperature: 0.8,
        max_tokens: 300
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
          .select('id, name, stock, price, attributes')
          .eq('id', args.product_id)
          .maybeSingle();

        if (productError || !product) {
          aiReply = 'معليش، ما لقيت المنتج. ممكن تعيد تحديده؟ 🤔';
        } else if (product.stock < (args.quantity || 1)) {
          aiReply = `للأسف المخزون ما يكفي 😔 متوفر بس ${product.stock} حبة`;
        } else {
          // Check if product has attributes but none selected
          if (hasProductAttributes(product) && !args.selected_color && !args.notes?.includes('لون')) {
            aiReply = `قبل ما نكمل الطلب، أي لون تفضل للـ${product.name}؟ 🎨`;
          } else {
            // Get shipping method details
            const { data: shippingMethod } = await supabase
              .from('shipping_methods')
              .select('id, name, price')
              .eq('id', args.shipping_method_id)
              .maybeSingle();

            const quantity = args.quantity || 1;
            const paymentMethod = args.payment_method || 'cod';
            
            // Build notes with color/size info
            let orderNotes = '';
            if (args.selected_color) orderNotes += `اللون: ${args.selected_color}\n`;
            if (args.selected_size) orderNotes += `المقاس: ${args.selected_size}\n`;
            if (args.notes) orderNotes += args.notes;
            orderNotes += `\nالكمية: ${quantity}`;
            
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
                notes: orderNotes.trim(),
                status: 'قيد الانتظار',
                payment_status: paymentMethod === 'cod' ? 'cod' : 'pending',
                ai_generated: true,
                source_platform: conversation.channel
              })
              .select('id, order_number')
              .single();

            if (orderError) {
              console.error('Error creating order:', orderError);
              aiReply = 'صار مشكلة بسيطة، ممكن نحاول مرة ثانية؟ 😅';
            } else {
              // Reduce product stock
              const newStock = product.stock - quantity;
              await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', args.product_id);

              const shippingName = shippingMethod?.name || 'توصيل';
              const shippingPrice = args.shipping_price || shippingMethod?.price || 0;

              // Handle payment
              if (paymentMethod === 'electronic' && paymentSettings?.paytabs_enabled) {
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

                  if (paymentData.payment_url) {
                    aiReply = `تمام! 🎉 طلبك #${newOrder.order_number}

📦 ${product.name}${args.selected_color ? ` (${args.selected_color})` : ''}
🚚 ${shippingName}
💰 الإجمالي: ${args.total_price}ر

ادفع من هنا 👇
${paymentData.payment_url}`;
                  } else {
                    aiReply = `تم الطلب #${newOrder.order_number}! 🎉
بس صار مشكلة برابط الدفع، راح نتواصل معك 📞`;
                  }
                } catch (paymentErr) {
                  console.error('Payment error:', paymentErr);
                  aiReply = `طلبك #${newOrder.order_number} جاهز! ✅
راح نتواصل معك لترتيب الدفع 📞`;
                }
              } else {
                // COD order
                aiReply = `تمام! 🎉 طلبك #${newOrder.order_number}

📦 ${product.name}${args.selected_color ? ` (${args.selected_color})` : ''}
📍 ${args.shipping_address}
🚚 ${shippingName}
💰 ${args.total_price}ر (دفع عند الاستلام)

راح نتواصل معك قريب! شكراً 🙏`;
              }
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
        sender_id: null,
        reply_sent: true
      });

    if (insertError) {
      console.error('Error saving AI message:', insertError);
    }

    // Mark customer messages as replied
    await supabase
      .from('messages')
      .update({ reply_sent: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .eq('reply_sent', false);

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Send message to the channel (Facebook, WhatsApp, Instagram)
    const channel = conversation.channel;
    
    if (channel === 'facebook' || channel === 'instagram') {
      const { data: integration } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', channel)
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
