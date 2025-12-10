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
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { conversationId } = await req.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'Missing conversationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if AI is enabled for this conversation
    if (!conversation.ai_enabled) {
      console.log('AI not enabled for conversation:', conversationId);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'AI not enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get unreplied customer messages
    const { data: unrepliedMessages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .eq('reply_sent', false)
      .eq('is_old', false)
      .order('created_at', { ascending: true });

    if (msgError || !unrepliedMessages || unrepliedMessages.length === 0) {
      console.log('No unreplied messages found');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'No unreplied messages' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if oldest unreplied message is at least 10 seconds old
    const oldestMessage = unrepliedMessages[0];
    const messageAge = Date.now() - new Date(oldestMessage.created_at).getTime();
    if (messageAge < 10000) {
      console.log('Message too recent, waiting for more input');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Waiting for customer to finish' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!openaiKey) {
      console.error('OpenAI API key not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation history (last 15 messages)
    const { data: history } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(15);

    const reversedHistory = (history || []).reverse();

    // Get products for this workspace
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('workspace_id', conversation.workspace_id)
      .eq('is_active', true)
      .limit(20);

    // Build context for AI
    const productsList = (products || [])
      .map(p => `- ${p.name}: ${p.description || ''} (السعر: ${p.price} ريال)`)
      .join('\n');

    const messagesForAI = reversedHistory.map(m => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: m.content,
    }));

    // Generate AI response
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `أنت مساعد مبيعات ذكي باسم "المارد". تتحدث العربية بطلاقة.

مهمتك:
- الرد على استفسارات العملاء بشكل طبيعي ومهني
- اقتراح المنتجات المناسبة من الكتالوج
- جمع معلومات الطلب (الاسم، الهاتف، العنوان) عند إبداء نية الشراء
- إنشاء الطلبات تلقائياً

المنتجات المتاحة:
${productsList || 'لا توجد منتجات حالياً'}

قواعد الرد:
- رد برسالة واحدة قصيرة (2-3 جمل)
- لا تكرر نفسك
- كن ودوداً ومحترفاً
- اسأل عن التفاصيل فقط عند الحاجة`,
          },
          ...messagesForAI,
        ],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok || !aiData.choices?.[0]?.message?.content) {
      console.error('OpenAI error:', aiData);
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const replyText = aiData.choices[0].message.content;
    console.log('AI generated reply:', replyText.substring(0, 100));

    // Mark all unreplied messages as replied FIRST
    const messageIds = unrepliedMessages.map(m => m.id);
    await supabase
      .from('messages')
      .update({ reply_sent: true })
      .in('id', messageIds);

    // Send reply via send-message function
    const sendResult = await supabase.functions.invoke('send-message', {
      body: { conversationId, message: replyText }
    });

    if (sendResult.error) {
      console.error('Error sending reply:', sendResult.error);
      // Revert reply_sent status
      await supabase
        .from('messages')
        .update({ reply_sent: false })
        .in('id', messageIds);

      return new Response(
        JSON.stringify({ error: 'Failed to send reply' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Reply sent successfully');

    return new Response(
      JSON.stringify({ success: true, reply: replyText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Auto-reply error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
