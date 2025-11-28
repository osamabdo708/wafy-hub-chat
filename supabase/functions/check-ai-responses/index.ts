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
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all conversations with AI enabled
    const { data: conversations, error: convsError } = await supabase
      .from('conversations')
      .select('*')
      .eq('ai_enabled', true);

    if (convsError) {
      console.error('Error fetching conversations:', convsError);
      throw convsError;
    }

    console.log(`Found ${conversations?.length || 0} AI-enabled conversations`);

    const responses = [];
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    for (const conversation of conversations || []) {
      // Get the latest message
      const { data: latestMessage, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (msgError) {
        console.error(`Error fetching message for conversation ${conversation.id}:`, msgError);
        continue;
      }

      // Check if there's a recent customer message that needs a response
      if (!latestMessage) {
        console.log(`No messages in conversation ${conversation.id}`);
        continue;
      }

      // Skip if message is older than 5 minutes
      if (latestMessage.created_at < fiveMinutesAgo) {
        console.log(`Message too old in conversation ${conversation.id}`);
        continue;
      }

      // Skip if last message was from agent
      if (latestMessage.sender_type === 'agent') {
        console.log(`Last message was from agent in conversation ${conversation.id}`);
        continue;
      }

      console.log(`Processing conversation ${conversation.id} with recent customer message`);

      // Get all products
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true);

      console.log(`Found ${products?.length || 0} products for AI context`);

      // Get conversation history
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .limit(20);

      console.log(`Found ${messages?.length || 0} messages in conversation history`);

      const conversationHistory = messages?.map(msg => ({
        role: msg.sender_type === 'customer' ? 'user' : 'assistant',
        content: msg.content
      })) || [];

      const productsCatalog = products?.map(p => 
        `المنتج: ${p.name}\nالوصف: ${p.description || 'لا يوجد وصف'}\nالسعر: ${p.price} ريال\nالمخزون: ${p.stock}\nالفئة: ${p.category || 'غير محدد'}`
      ).join('\n\n') || 'لا توجد منتجات متاحة';

      const systemPrompt = `أنت مساعد مبيعات ذكي في متجر إلكتروني. مهمتك هي:
1. مساعدة العملاء في العثور على المنتجات المناسبة
2. الإجابة على أسئلة العملاء حول المنتجات من المعلومات المتاحة فقط
3. إذا سأل العميل عن منتج غير موجود في القائمة، أخبره بأن هذا المنتج غير متوفر في المتجر حالياً
4. جمع تفاصيل الطلب (الاسم، رقم الهاتف، العنوان) إذا أكد العميل رغبته في الطلب
5. عندما يؤكد العميل الطلب ويقدم كل التفاصيل المطلوبة، استخدم أداة create_order لإنشاء الطلب
6. كن ودوداً ومحترفاً دائماً

المنتجات المتاحة:
${productsCatalog}

معلومات العميل:
الاسم: ${conversation.customer_name || 'غير معروف'}
الهاتف: ${conversation.customer_phone || 'غير معروف'}
البريد الإلكتروني: ${conversation.customer_email || 'غير معروف'}

تحدث بالعربية دائماً وكن مختصراً وواضحاً في ردودك.`;

      // Prepare tools for order creation
      const tools = [
        {
          type: "function",
          function: {
            name: "create_order",
            description: "إنشاء طلب جديد عندما يؤكد العميل رغبته في الشراء ويقدم كل التفاصيل المطلوبة",
            parameters: {
              type: "object",
              properties: {
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
                product_name: {
                  type: "string",
                  description: "اسم المنتج المطلوب"
                },
                notes: {
                  type: "string",
                  description: "ملاحظات إضافية مثل العنوان أو تفاصيل التوصيل"
                }
              },
              required: ["customer_name", "customer_phone", "product_name"]
            }
          }
        }
      ];

      // Call OpenAI with tool calling
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
            ...conversationHistory
          ],
          tools: tools,
          tool_choice: "auto",
          temperature: 0.7,
          max_tokens: 500
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI API error for conversation ${conversation.id}:`, response.status, errorText);
        continue;
      }

      const aiData = await response.json();
      
      if (!aiData.choices || !aiData.choices[0] || !aiData.choices[0].message) {
        console.error(`Invalid OpenAI response for conversation ${conversation.id}:`, aiData);
        continue;
      }
      
      const message = aiData.choices[0].message;
      let aiReply = message.content || '';

      // Check if AI wants to create an order
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        
        if (toolCall.function.name === 'create_order') {
          try {
            const orderData = JSON.parse(toolCall.function.arguments);
            console.log(`Creating order for conversation ${conversation.id}:`, orderData);

            // Find the product
            const product = products?.find(p => 
              p.name.toLowerCase().includes(orderData.product_name.toLowerCase()) ||
              orderData.product_name.toLowerCase().includes(p.name.toLowerCase())
            );

            if (product) {
              // Create the order
              const { data: newOrder, error: orderError } = await supabase
                .from('orders')
                .insert({
                  conversation_id: conversation.id,
                  customer_name: orderData.customer_name,
                  customer_phone: orderData.customer_phone,
                  customer_email: orderData.customer_email || conversation.customer_email,
                  product_id: product.id,
                  price: product.price,
                  status: 'قيد الانتظار',
                  notes: orderData.notes,
                  ai_generated: true
                })
                .select()
                .single();

              if (orderError) {
                console.error(`Error creating order for conversation ${conversation.id}:`, orderError);
                aiReply = `تم تأكيد طلبك لـ ${product.name} بسعر ${product.price} ريال. سنتواصل معك قريباً لإتمام الطلب.`;
              } else {
                console.log(`Order created successfully:`, newOrder);
                aiReply = `تم إنشاء طلبك بنجاح! 🎉\n\nرقم الطلب: ${newOrder.order_number}\nالمنتج: ${product.name}\nالسعر: ${product.price} ريال\nالحالة: ${newOrder.status}\n\nشكراً لك! سنتواصل معك قريباً.`;
              }
            } else {
              console.log(`Product not found for: ${orderData.product_name}`);
              aiReply = `عذراً، لم أتمكن من العثور على المنتج المطلوب في قائمة المنتجات المتاحة.`;
            }
          } catch (parseError) {
            console.error(`Error parsing order data:`, parseError);
            aiReply = `تم تأكيد طلبك. سنتواصل معك قريباً لإتمام الطلب.`;
          }
        }
      }

      console.log(`AI Reply for conversation ${conversation.id}:`, aiReply);

      // Save AI message
      const { error: saveError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: aiReply,
          sender_type: 'agent',
          sender_id: null
        });

      if (saveError) {
        console.error(`Error saving AI message for conversation ${conversation.id}:`, saveError);
      } else {
        console.log(`AI message saved successfully for conversation ${conversation.id}`);
      }

      // Update conversation
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);

      // Send to channel
      const channel = conversation.channel;
      
      console.log(`Attempting to send message to ${channel} channel for conversation ${conversation.id}`);
      
      if (channel === 'facebook') {
        const { data: integration } = await supabase
          .from('channel_integrations')
          .select('config')
          .eq('channel', 'facebook')
          .maybeSingle();

        console.log(`Facebook integration found:`, !!integration);

        if (integration?.config?.page_access_token) {
          const recipientId = conversation.customer_phone;
          
          console.log(`Sending to Facebook recipient: ${recipientId}`);
          
          const fbResponse = await fetch(`https://graph.facebook.com/v18.0/me/messages`, {
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

          const fbResult = await fbResponse.json();
          console.log(`Facebook send result:`, fbResult);
        } else {
          console.log('No Facebook page access token configured');
        }
      } else if (channel === 'whatsapp') {
        const { data: integration } = await supabase
          .from('channel_integrations')
          .select('config')
          .eq('channel', 'whatsapp')
          .maybeSingle();

        console.log(`WhatsApp integration found:`, !!integration);

        if (integration?.config?.phone_number_id && integration?.config?.access_token) {
          console.log(`Sending to WhatsApp: ${conversation.customer_phone}`);
          
          const waResponse = await fetch(`https://graph.facebook.com/v18.0/${integration.config.phone_number_id}/messages`, {
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

          const waResult = await waResponse.json();
          console.log(`WhatsApp send result:`, waResult);
        } else {
          console.log('No WhatsApp credentials configured');
        }
      }

      responses.push({
        conversation_id: conversation.id,
        success: true
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      processed: responses.length,
      responses
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in check-ai-responses:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
