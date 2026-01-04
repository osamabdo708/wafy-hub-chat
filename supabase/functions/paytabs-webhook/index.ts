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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // PayTabs sends callback data as form-urlencoded or JSON
    let callbackData;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      callbackData = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      callbackData = Object.fromEntries(formData.entries());
    } else {
      // Try to parse as JSON anyway
      const body = await req.text();
      try {
        callbackData = JSON.parse(body);
      } catch {
        console.error('Failed to parse callback body:', body);
        return new Response('Invalid request body', { status: 400 });
      }
    }

    console.log('PayTabs webhook received:', JSON.stringify(callbackData));

    const {
      cart_id,
      tran_ref,
      payment_result,
      tran_type,
      cart_amount,
      cart_currency
    } = callbackData;

    if (!cart_id) {
      console.error('No cart_id in callback');
      return new Response('Missing cart_id', { status: 400 });
    }

    // Find the order by order_number (cart_id)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, workspace_id')
      .eq('order_number', cart_id)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', cart_id, orderError);
      return new Response('Order not found', { status: 404 });
    }

    // Determine payment status based on PayTabs response
    let paymentStatus = 'pending';
    const responseStatus = payment_result?.response_status;
    const responseCode = payment_result?.response_code;

    console.log('Payment result:', { responseStatus, responseCode });

    if (responseStatus === 'A' || responseCode === '000') {
      // Payment authorized/successful
      paymentStatus = 'paid';
    } else if (responseStatus === 'D' || responseStatus === 'E') {
      // Payment declined or error
      paymentStatus = 'failed';
    } else if (responseStatus === 'P') {
      // Pending
      paymentStatus = 'pending';
    } else if (responseStatus === 'V') {
      // Voided
      paymentStatus = 'voided';
    } else if (responseStatus === 'R') {
      // Refunded
      paymentStatus = 'refunded';
    }

    // Update order payment status
    const updateData: any = {
      payment_status: paymentStatus
    };

    // If payment is successful, also update order status
    if (paymentStatus === 'paid') {
      updateData.status = 'مؤكد';
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order.id);

    if (updateError) {
      console.error('Failed to update order:', updateError);
      return new Response('Failed to update order', { status: 500 });
    }

    console.log(`Order ${cart_id} payment status updated to: ${paymentStatus}`);

    return new Response(
      JSON.stringify({ success: true, payment_status: paymentStatus }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('PayTabs webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
