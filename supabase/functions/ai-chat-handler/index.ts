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
      .select('*')
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
      .select('*, categories:category_id(name)')
      .eq('is_active', true);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

    // Helper function to format product attributes
    const formatProductAttributes = (product: any): string => {
      const attrs = product.attributes;
      if (!attrs) return '';
      
      let attrText = '';
      
      // Format colors
      if (attrs.colors && attrs.colors.length > 0) {
        attrText += '\nالألوان المتاحة:\n';
        attrs.colors.forEach((color: any) => {
          attrText += `  - ${color.name}`;
          if (color.price) attrText += ` (${color.price} ريال)`;
          attrText += '\n';
          
          // Color sub-attributes (like sizes per color)
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
      
      // Format custom attributes
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

    // Build products catalog text with full details
    const productsCatalog = products?.map(p => {
      let productInfo = `المنتج: ${p.name}`;
      productInfo += `\nالوصف: ${p.description || 'لا يوجد وصف'}`;
      productInfo += `\nالسعر: ${p.price} ريال`;
      
      if (p.min_negotiable_price) {
        productInfo += `\nالحد الأدنى للتفاوض: ${p.min_negotiable_price} ريال`;
      }
      
      productInfo += `\nالمخزون: ${p.stock > 0 ? `${p.stock} متوفر` : 'غير متوفر'}`;
      productInfo += `\nالفئة: ${p.categories?.name || p.category || 'غير محدد'}`;
      
      // Add attributes
      const attrText = formatProductAttributes(p);
      if (attrText) {
        productInfo += attrText;
      }
      
      if (p.gallery_images && p.gallery_images.length > 0) {
        productInfo += `\nعدد الصور: ${p.gallery_images.length + (p.image_url ? 1 : 0)}`;
      }
      
      return productInfo;
    }).join('\n\n---\n\n') || 'لا توجد منتجات متاحة';

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
6. احسب السعر الإجمالي عند طلب العميل (سعر المنتج + سعر اللون + سعر المقاس/السمة)
7. جمع تفاصيل الطلب (الاسم، رقم الهاتف، العنوان، اللون، المقاس) إذا أكد العميل رغبته في الطلب
8. كن ودوداً ومحترفاً دائماً
9. يمكنك التفاوض على السعر ضمن الحد الأدنى للتفاوض إن وجد

المنتجات المتاحة:
${productsCatalog}

معلومات العميل:
الاسم: ${conversation.customer_name || 'غير معروف'}
الهاتف: ${conversation.customer_phone || 'غير معروف'}
البريد الإلكتروني: ${conversation.customer_email || 'غير معروف'}

تحدث بالعربية دائماً وكن مختصراً وواضحاً في ردودك.`;

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
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    const aiData = await response.json();
    const aiReply = aiData.choices[0].message.content;

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
      // Get Facebook integration
      const { data: integration } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'facebook')
        .single();

      if (integration?.config?.page_access_token) {
        const recipientId = conversation.customer_phone; // Facebook PSID stored in customer_phone
        
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
      // Get WhatsApp integration
      const { data: integration } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'whatsapp')
        .single();

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
