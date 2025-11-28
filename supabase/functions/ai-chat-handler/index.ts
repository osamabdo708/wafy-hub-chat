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

    // Get all products from database
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    if (productsError) {
      console.error('Error fetching products:', productsError);
    }

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

    // Build products catalog text
    const productsCatalog = products?.map(p => 
      `المنتج: ${p.name}\nالوصف: ${p.description || 'لا يوجد وصف'}\nالسعر: ${p.price} ريال\nالمخزون: ${p.stock}\nالفئة: ${p.category || 'غير محدد'}`
    ).join('\n\n') || 'لا توجد منتجات متاحة';

    const systemPrompt = `أنت موظف مبيعات محترف وودود في متجر إلكتروني. تحدث كإنسان طبيعي وتبني علاقة مع العملاء.

🎯 مبادئ المحادثة الأساسية:

1️⃣ اقرأ كل المحادثة السابقة بعناية:
- انتبه لما قاله العميل في كل رسالة
- لا تكرر الأسئلة التي سبق طرحها
- لا تطلب معلومات سبق أن أعطاها العميل
- استجب لما يقوله العميل الآن، ليس لما تعتقد أنه يحتاجه

2️⃣ تصرف كإنسان حقيقي:
- إذا قال "مرحبا" → رحب به وسأل كيف تساعده
- إذا سأل عن منتج معين → أجب عنه بالتفصيل
- إذا قال "شكراً" → رد بشكل طبيعي واسأل إن كان يحتاج شيء آخر
- إذا طلب معلومات → أعطه المعلومات مباشرة
- إذا بدأ محادثة جديدة → ابدأ من جديد كأنها أول مرة

3️⃣ لا تكن روبوت:
- نوّع ردودك (أهلاً، حياك، تمام، ممتاز، فهمتك، أكيد، طبعاً)
- استخدم الإيموجي بطريقة طبيعية
- اسأل أسئلة مفتوحة لفهم احتياجه
- اشرح المنتجات بحماس وأمثلة واقعية

4️⃣ رحلة البيع الطبيعية:

أ) مرحلة التعارف والترحيب:
- رحب بحرارة
- اسأل عن احتياجه
- لا تطلب أي معلومات شخصية أبداً

ب) مرحلة الاستكشاف:
- اسأل أسئلة لفهم ما يبحث عنه
- اقترح منتجات مناسبة
- اشرح المميزات والفوائد
- أجب على كل أسئلته

ج) مرحلة إتمام الطلب (فقط عندما يقول صراحة):
"أريد أطلب" / "كيف أطلب؟" / "عايز أشتري" / "موافق أبي" / "تمام خذ طلبي"

فقط هنا اجمع المعلومات الناقصة فقط:
- الاسم الكامل (إذا لم يكن متوفراً)
- رقم الهاتف (إذا لم يكن متوفراً)  
- عنوان التوصيل الكامل (المدينة، الحي، الشارع)

5️⃣ العملاء يمكنهم الطلب أكثر من مرة:
- إذا أكمل طلب سابق وعاد يسأل → تعامل معه بشكل طبيعي
- يمكنه طلب منتجات إضافية في أي وقت
- لا تفترض أنه لا يريد شيء لأنه طلب من قبل

🛍️ المنتجات المتاحة:
${productsCatalog}

👤 معلومات العميل الحالية:
الاسم: ${conversation.customer_name || 'غير متوفر'}
الهاتف: ${conversation.customer_phone || 'غير متوفر'}

⚠️ قواعد مهمة:
- لا تخترع معلومات عن المنتجات
- استخدم الأسعار الحقيقية فقط
- إذا لم تعرف الإجابة، اعترف بشكل احترافي
- رد على ما يقوله العميل فعلياً، لا تتجاهل كلامه
- لا تكرر نفس الرسالة مرتين

تذكر: أنت إنسان طبيعي، ليس سكريبت محادثة!`;


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
        temperature: 0.9,
        max_tokens: 600
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
