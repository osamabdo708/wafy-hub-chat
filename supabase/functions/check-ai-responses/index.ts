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

    let processedCount = 0;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    for (const conversation of conversations || []) {
      // Get ALL unreplied customer messages
      const { data: unrepliedMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'customer')
        .eq('reply_sent', false)
        .eq('is_old', false)
        .gte('created_at', fiveMinutesAgo)
        .order('created_at', { ascending: true });

      if (!unrepliedMessages || unrepliedMessages.length === 0) {
        console.log(`No unreplied messages in conversation ${conversation.id}`);
        continue;
      }

      // Check if the most recent unreplied message is at least 10 seconds old
      const mostRecentMessage = unrepliedMessages[unrepliedMessages.length - 1];
      const messageAge = Date.now() - new Date(mostRecentMessage.created_at).getTime();
      const TEN_SECONDS = 10 * 1000;

      if (messageAge < TEN_SECONDS) {
        console.log(`Skipping conversation ${conversation.id} - most recent message is only ${Math.floor(messageAge / 1000)} seconds old`);
        continue;
      }

      console.log(`Processing conversation ${conversation.id} with ${unrepliedMessages.length} unreplied messages - will send ONE response`);

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
5. كن ودوداً ومحترفاً دائماً

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
            ...conversationHistory
          ],
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
      
      const aiReply = aiData.choices[0].message.content;

      console.log(`AI Reply for conversation ${conversation.id}:`, aiReply);

      // Save AI message with reply_sent=true to prevent duplicates
      const { error: saveError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: aiReply,
          sender_type: 'agent',
          sender_id: null,
          message_id: `ai_${Date.now()}_${conversation.id}`,
          reply_sent: true,
          is_old: false
        });

      if (saveError) {
        console.error(`Error saving AI message for conversation ${conversation.id}:`, saveError);
        continue;
      }

      console.log(`AI message saved successfully for conversation ${conversation.id}`);

      // Mark ALL unreplied customer messages as replied to prevent duplicate responses
      await supabase
        .from('messages')
        .update({ reply_sent: true })
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'customer')
        .eq('reply_sent', false);

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

      processedCount++;
    }

    return new Response(JSON.stringify({ 
      success: true,
      processed: processedCount
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
