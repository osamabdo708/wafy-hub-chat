import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse product attributes DYNAMICALLY - supports both legacy format and Shopify-style variants
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
        image_url?: string;
        inventory_quantity?: number;
        subVariants?: { name: string; options: string[] }[];
      }[];
    }[];
  } = { hasVariants: false, variants: [] };

  if (!attrs) return result;

  // Check for Shopify-style variants first (new format)
  if (attrs.variants && Array.isArray(attrs.variants) && attrs.variants.length > 0) {
    result.hasVariants = true;
    
    // Get option names from the options array
    const optionNames: string[] = [];
    if (attrs.options && Array.isArray(attrs.options)) {
      for (const opt of attrs.options) {
        if (opt.name && opt.name !== 'Title') {
          optionNames.push(opt.name);
        }
      }
    }
    
    // If no named options, use option1, option2, option3 as generic names
    const variantOptions: { [key: string]: { value: string; price: number; image_url?: string; inventory_quantity?: number }[] } = {};
    
    for (const variant of attrs.variants) {
      // Process option1
      if (variant.option1) {
        const optName = optionNames[0] || 'الخيار';
        if (!variantOptions[optName]) variantOptions[optName] = [];
        const exists = variantOptions[optName].find(o => o.value === variant.option1);
        if (!exists) {
          variantOptions[optName].push({
            value: variant.option1,
            price: variant.price || product.price,
            image_url: variant.image_url,
            inventory_quantity: variant.inventory_quantity
          });
        }
      }
      // Process option2
      if (variant.option2) {
        const optName = optionNames[1] || 'الخيار 2';
        if (!variantOptions[optName]) variantOptions[optName] = [];
        const exists = variantOptions[optName].find(o => o.value === variant.option2);
        if (!exists) {
          variantOptions[optName].push({
            value: variant.option2,
            price: variant.price || product.price,
            image_url: variant.image_url,
            inventory_quantity: variant.inventory_quantity
          });
        }
      }
      // Process option3
      if (variant.option3) {
        const optName = optionNames[2] || 'الخيار 3';
        if (!variantOptions[optName]) variantOptions[optName] = [];
        const exists = variantOptions[optName].find(o => o.value === variant.option3);
        if (!exists) {
          variantOptions[optName].push({
            value: variant.option3,
            price: variant.price || product.price,
            image_url: variant.image_url,
            inventory_quantity: variant.inventory_quantity
          });
        }
      }
    }
    
    // Add variants to result
    for (const [optName, options] of Object.entries(variantOptions)) {
      result.variants.push({
        name: optName,
        type: 'custom',
        options: options
      });
    }
    
    return result;
  }

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

// Get required variants for a product
function getRequiredVariants(product: any): string[] {
  const parsed = parseProductAttributes(product);
  const required: string[] = [];
  
  for (const variant of parsed.variants) {
    required.push(variant.name);
    // If color has sub-variants, add them too
    if (variant.type === 'color') {
      for (const option of variant.options) {
        if (option.subVariants) {
          for (const sub of option.subVariants) {
            if (!required.includes(sub.name)) {
              required.push(sub.name);
            }
          }
        }
      }
    }
  }
  
  return required;
}

// Find matching variant from Shopify-style variants
function findShopifyVariant(product: any, selectedVariants: { [key: string]: string }): any | null {
  const attrs = product.attributes as any;
  if (!attrs?.variants || !Array.isArray(attrs.variants)) return null;
  
  // Get option names
  const optionNames: string[] = [];
  if (attrs.options && Array.isArray(attrs.options)) {
    for (const opt of attrs.options) {
      if (opt.name && opt.name !== 'Title') {
        optionNames.push(opt.name);
      }
    }
  }
  
  // Find matching variant
  for (const variant of attrs.variants) {
    let matches = true;
    
    // Check option1
    if (optionNames[0] && selectedVariants[optionNames[0]]) {
      if (variant.option1 !== selectedVariants[optionNames[0]]) matches = false;
    } else if (selectedVariants['الخيار'] && variant.option1 !== selectedVariants['الخيار']) {
      matches = false;
    }
    
    // Check option2
    if (optionNames[1] && selectedVariants[optionNames[1]]) {
      if (variant.option2 !== selectedVariants[optionNames[1]]) matches = false;
    } else if (selectedVariants['الخيار 2'] && variant.option2 !== selectedVariants['الخيار 2']) {
      matches = false;
    }
    
    // Check option3
    if (optionNames[2] && selectedVariants[optionNames[2]]) {
      if (variant.option3 !== selectedVariants[optionNames[2]]) matches = false;
    } else if (selectedVariants['الخيار 3'] && variant.option3 !== selectedVariants['الخيار 3']) {
      matches = false;
    }
    
    if (matches) return variant;
  }
  
  return null;
}

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
    const publicAppUrl = 'https://wafy-hub-chat.lovable.app';

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
      .select('id, name, description, price, min_negotiable_price, stock, category, category_id, attributes, image_url')
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
      .select('order_number, status, price, created_at')
      .eq('customer_phone', conversation.customer_phone)
      .order('created_at', { ascending: false })
      .limit(3);

    if (ordersHistoryError) {
      console.error('Error fetching customer orders:', ordersHistoryError);
    }

    // Build products catalog dynamically
    const productsCatalog = buildProductContext(products || []);

    // Build shipping methods catalog
    const shippingCatalog = shippingMethods?.map(s => 
      `[${s.id}] ${s.name}: ${s.price}₪ (${s.estimated_days || '؟'} يوم)`
    ).join('\n') || 'شحن مجاني';

    // Build payment methods text
    const paymentMethods = [];
    if (paymentSettings?.cod_enabled !== false) paymentMethods.push('نقدي (cod)');
    if (paymentSettings?.paytabs_enabled) paymentMethods.push('إلكتروني (electronic)');
    const paymentMethodsCatalog = paymentMethods.length > 0 ? paymentMethods.join(' أو ') : 'نقدي فقط';

    // Build customer order history
    const customerOrdersHistory = customerOrders && customerOrders.length > 0
      ? customerOrders.map(o => `#${o.order_number} (${o.status})`).join('، ')
      : '';

    // Get conversation history
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(25);

    // Build conversation context
    const conversationHistory = messages?.map(msg => ({
      role: msg.sender_type === 'customer' ? 'user' : 'assistant',
      content: msg.content
    })) || [];

    // DYNAMIC system prompt with STRICT flow control
    const systemPrompt = `أنت مساعد مبيعات ودود. تتكلم بشكل طبيعي وبسيط.

📦 المنتجات المتوفرة:
${productsCatalog}

🚚 طرق الشحن:
${shippingCatalog}

💳 طرق الدفع: ${paymentMethodsCatalog}
${customerOrdersHistory ? `\n📜 طلبات سابقة للعميل: ${customerOrdersHistory}` : ''}

👤 بيانات العميل المعروفة:
- الاسم: ${conversation.customer_name || '❌ غير معروف'}
- الهاتف: ${conversation.customer_phone || '❌ غير معروف'}

🚫 ممنوع منعاً باتاً:
- لا تسأل عن "مقاس" أو "حجم" أو "size" إلا إذا موجود تحت "المتغيرات المتوفرة" للمنتج
- لا تخترع متغيرات غير موجودة في وصف المنتج
- إذا المنتج فيه ألوان فقط بدون ↳ تحتها = لا يوجد مقاسات

📋 التدفق الإلزامي (بالترتيب):
1️⃣ العميل يسأل عن منتج ← أعطه الألوان/الأسعار المتوفرة
2️⃣ العميل يختار لون ← إذا فيه ↳ مقاسات تحت هذا اللون اسأل عنها، وإلا انتقل للخطوة 3
3️⃣ اطلب الاسم: "ممكن اسمك الكريم؟"
4️⃣ اطلب الهاتف: "رقم الجوال؟"
5️⃣ اطلب العنوان: "وين أوصلك الطلب؟"
6️⃣ اعرض طرق الشحن واطلب الاختيار
7️⃣ اسأل: "نقدي عند الاستلام أو دفع إلكتروني؟"
8️⃣ استخدم create_order

مثال منتج بألوان فقط (بدون مقاسات):
- العميل: "أبغى الحذاء"
- أنت: "عندنا حذاء اديداس! الألوان: أبيض (150₪)، بيج (170₪). أي لون تحب؟"
- العميل: "أبيض"
- أنت: "أبيض ممتاز! ممكن اسمك الكريم؟" ← (لا تسأل عن مقاس!)

مثال منتج بألوان ومقاسات (↳ موجود):
- العميل: "أبغى التيشيرت"
- أنت: "التيشيرت متوفر! الألوان: أبيض، أسود. أي لون؟"
- العميل: "أسود"
- أنت: "أسود! المقاسات المتوفرة: S، M، L. أي مقاس؟" ← (لأن ↳ المقاس موجود تحت أسود)
- العميل: "L"
- أنت: "تمام L! ممكن اسمك الكريم؟"`;

    // Define tools for order creation
    const tools = [
      {
        type: "function",
        function: {
          name: "create_order",
          description: "أنشئ طلب بعد جمع: المنتج + المتغيرات (إذا موجودة) + الاسم + الهاتف + العنوان + الشحن + الدفع. مهم: إذا المنتج فيه متغيرات (ألوان/مقاسات) لازم تجمعها من العميل قبل الطلب",
          parameters: {
            type: "object",
            properties: {
              product_id: { type: "string", description: "معرف المنتج UUID" },
              product_name: { type: "string", description: "اسم المنتج" },
              selected_variants: {
                type: "object",
                description: "المتغيرات المختارة: {اللون: 'أبيض', المقاس: '42'...}. إجباري إذا المنتج فيه متغيرات",
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
      },
      {
        type: "function",
        function: {
          name: "notify_admin",
          description: "أرسل إشعار للمسؤولين عندما يطلب العميل شيء غير متعلق بالطلبات أو المنتجات - مثل شكوى، استفسار تقني، طلب دعم، أو أي موضوع خارج نطاق البيع",
          parameters: {
            type: "object",
            properties: {
              reason: { type: "string", description: "سبب الإشعار - ما الذي يريده العميل؟" },
              customer_message: { type: "string", description: "رسالة العميل الأصلية" },
              urgency: { type: "string", enum: ["low", "medium", "high"], description: "درجة الأهمية" }
            },
            required: ["reason", "customer_message"]
          }
        }
      }
    ];

    // Call OpenAI
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
        max_tokens: 400
      }),
    });

    const aiData = await response.json();
    console.log('[AI-CHAT] Response:', JSON.stringify(aiData, null, 2));

    let aiReply = '';
    const assistantMessage = aiData.choices?.[0]?.message;

    // Check if AI wants to call a tool
    if (assistantMessage?.tool_calls?.length > 0) {
      const toolCall = assistantMessage.tool_calls[0];
      
      if (toolCall.function.name === 'create_order') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          console.log('[AI-CHAT] Creating order with args:', args);

          // Check product stock
          const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, name, stock, price, attributes')
            .eq('id', args.product_id)
            .maybeSingle();

          if (productError || !product) {
            aiReply = 'معليش، ما لقيت المنتج. ممكن تعيد تحديده؟ 🤔';
          } else {
            // Check if product has variants and if they were provided
            const requiredVariants = getRequiredVariants(product);
            const missingVariants: string[] = [];
            
            if (requiredVariants.length > 0) {
              for (const variantName of requiredVariants) {
                if (!args.selected_variants || !args.selected_variants[variantName]) {
                  missingVariants.push(variantName);
                }
              }
            }
            
            if (missingVariants.length > 0) {
              // Missing required variants - ask user for them
              const missingList = missingVariants.join('، ');
              aiReply = `عشان أكمل الطلب، محتاج أعرف: ${missingList} 🤔`;
              console.log('[AI-CHAT] Missing variants:', missingVariants);
            } else {
              const quantity = args.quantity || 1;
              
              // Check for Shopify-style variant and its inventory
              const shopifyVariant = findShopifyVariant(product, args.selected_variants || {});
              let stockToCheck = product.stock;
              let variantPrice = product.price;
              
              if (shopifyVariant) {
                stockToCheck = shopifyVariant.inventory_quantity;
                variantPrice = shopifyVariant.price || product.price;
                console.log('[AI-CHAT] Using Shopify variant:', shopifyVariant);
              }
              
              if (stockToCheck !== null && stockToCheck !== undefined && stockToCheck < quantity) {
                aiReply = `للأسف المخزون ما يكفي 😔 متوفر بس ${product.stock} حبة`;
              } else {
                // Calculate correct price based on selected variant
                let finalProductPrice = args.final_product_price || variantPrice || product.price;

                // If using Shopify variant, use its price
                if (shopifyVariant) {
                  finalProductPrice = shopifyVariant.price || product.price;
                } else if (args.selected_variants?.اللون) {
                  // Legacy: If color was selected, get the color's price
                  const parsed = parseProductAttributes(product);
                  const colorVariant = parsed.variants.find(v => v.name === 'اللون');
                  if (colorVariant) {
                    const selectedColor = colorVariant.options.find(o => o.value === args.selected_variants.اللون);
                    if (selectedColor) {
                      finalProductPrice = selectedColor.price;
                    }
                  }
                }

              // Get shipping method details
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
                  conversation_id: conversationId,
                  product_id: args.product_id,
                  customer_name: args.customer_name,
                  customer_phone: args.customer_phone,
                  customer_email: conversation.customer_email || null,
                  shipping_address: args.shipping_address,
                  shipping_method_id: args.shipping_method_id,
                  price: totalPrice,
                  notes: orderNotes.trim(),
                  status: 'قيد الانتظار',
                  payment_method: args.payment_method === 'electronic' ? 'الكتروني' : 'نقدي',
                  payment_status: 'في انتظار الدفع',
                  ai_generated: true,
                  source_platform: conversation.channel
                })
                .select('id, order_number')
                .single();

              if (orderError) {
                console.error('[AI-CHAT] Order creation error:', orderError);
                aiReply = 'صار مشكلة بسيطة، ممكن نحاول مرة ثانية؟ 😅';
              } else {
                console.log('[AI-CHAT] ✅ Order created:', newOrder.order_number);

                // Update conversation with customer data (save real phone to customer_contact_phone, NOT customer_phone which is the channel recipient ID)
                await supabase
                  .from('conversations')
                  .update({
                    customer_name: args.customer_name || conversation.customer_name,
                    customer_contact_phone: args.customer_phone || null
                  })
                  .eq('id', conversationId);

                // Reduce product stock
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
                        'Authorization': `Bearer ${supabaseServiceKey}`
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

🧾 الفاتورة: ${invoiceUrl}`;
                    } else {
                      aiReply = `تم طلبك #${newOrder.order_number}! 🎉 لكن صار مشكلة برابط الدفع، راح نتواصل معك 📞`;
                    }
                  } catch (paymentError) {
                    console.error('[AI-CHAT] Payment error:', paymentError);
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
          }
        } catch (parseError) {
          console.error('[AI-CHAT] Tool parse error:', parseError);
          aiReply = 'معليش صار خطأ، ممكن نحاول مرة ثانية؟';
        }
      }
      else if (toolCall.function.name === 'notify_admin') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          console.log('[AI-CHAT] Notifying admin:', args);
          
          // Create an internal note/notification for admins
          // We'll insert a message with sender_type 'system' to flag it for admin attention
          await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              content: `⚠️ إشعار للمسؤول:\nالسبب: ${args.reason}\nرسالة العميل: ${args.customer_message}\nالأهمية: ${args.urgency || 'medium'}`,
              sender_type: 'agent',
              message_id: `admin_notify_${Date.now()}_${conversationId}`,
              reply_sent: true,
              is_old: false
            });
          
          // Update conversation status to flag it needs attention
          await supabase
            .from('conversations')
            .update({
              status: 'معلق',
              tags: ['يحتاج مراجعة']
            })
            .eq('id', conversationId);
          
          // Respond to customer
          aiReply = assistantMessage?.content || 'شكراً لك! تم إبلاغ فريقنا وسيتواصلون معك قريباً 🙏';
          
          console.log('[AI-CHAT] ✅ Admin notified, conversation marked for review');
        } catch (notifyError) {
          console.error('[AI-CHAT] Notify admin error:', notifyError);
          aiReply = 'تم تسجيل طلبك، سيتواصل معك أحد من فريقنا قريباً 🙏';
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
        conversation_id: conversationId,
        content: aiReply,
        sender_type: 'agent',
        message_id: `ai_${Date.now()}_${conversationId}`,
        reply_sent: true,
        is_old: false
      });

    // Update conversation
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        status: 'مفتوح'
      })
      .eq('id', conversationId);

    return new Response(JSON.stringify({ reply: aiReply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[AI-CHAT] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
