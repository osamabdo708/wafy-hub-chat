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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { type, record } = await req.json();

    console.log(`Notification trigger: type=${type}`, JSON.stringify(record).substring(0, 200));

    let title = '';
    let body = '';
    let notifData: Record<string, string> = {};
    let workspaceId = '';

    if (type === 'new_conversation') {
      workspaceId = record.workspace_id;
      const channel = record.channel || 'unknown';
      const customerName = record.customer_name || 'عميل جديد';
      title = '💬 محادثة جديدة';
      body = `${customerName} بدأ محادثة عبر ${channel}`;
      notifData = {
        type: 'new_conversation',
        conversation_id: record.id,
        channel,
      };
    } else if (type === 'new_message') {
      // Get conversation for workspace_id
      const { data: conversation } = await supabase
        .from('conversations')
        .select('workspace_id, customer_name, channel')
        .eq('id', record.conversation_id)
        .single();

      if (!conversation) {
        console.log('Conversation not found for message');
        return new Response(JSON.stringify({ success: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Only notify for customer messages
      if (record.sender_type !== 'customer') {
        console.log('Skipping notification for non-customer message');
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      workspaceId = conversation.workspace_id;
      const customerName = conversation.customer_name || 'عميل';
      const messagePreview = (record.content || '').substring(0, 100);
      title = `📩 رسالة من ${customerName}`;
      body = messagePreview || 'رسالة جديدة';
      notifData = {
        type: 'new_message',
        conversation_id: record.conversation_id,
        channel: conversation.channel,
      };
    } else if (type === 'new_order') {
      workspaceId = record.workspace_id;
      const orderNumber = record.order_number || '';
      const customerName = record.customer_name || 'عميل';
      const price = record.price || 0;
      title = '🛒 طلب جديد';
      body = `طلب #${orderNumber} من ${customerName} - ${price} ₪`;
      notifData = {
        type: 'new_order',
        order_id: record.id,
        order_number: orderNumber,
      };
    } else {
      console.log(`Unknown notification type: ${type}`);
      return new Response(JSON.stringify({ success: false, error: 'Unknown type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!workspaceId) {
      console.log('No workspace_id found');
      return new Response(JSON.stringify({ success: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call the push notification function
    const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        data: notifData,
        workspace_id: workspaceId,
      }),
    });

    const pushResult = await pushResponse.json();
    console.log('Push notification result:', pushResult);

    return new Response(JSON.stringify({ success: true, push: pushResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in notify-new-activity:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
