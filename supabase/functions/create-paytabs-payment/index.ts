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
    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Order ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, products(name)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order fetch error:', orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payment settings for the workspace
    const { data: paymentSettings, error: settingsError } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('workspace_id', order.workspace_id)
      .single();

    if (settingsError || !paymentSettings?.paytabs_enabled) {
      console.error('Payment settings error:', settingsError);
      return new Response(
        JSON.stringify({ error: 'PayTabs is not configured for this workspace' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profileId = paymentSettings.paytabs_profile_id;
    const serverKey = paymentSettings.paytabs_server_key_encrypted;

    if (!profileId || !serverKey) {
      return new Response(
        JSON.stringify({ error: 'PayTabs credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create PayTabs payment page
    const callbackUrl = `${supabaseUrl}/functions/v1/paytabs-webhook`;
    const returnUrl = `${supabaseUrl.replace('.supabase.co', '')}/payment-success?order=${order.order_number}`;

    const paymentRequest = {
      profile_id: profileId,
      tran_type: "sale",
      tran_class: "ecom",
      cart_id: order.order_number,
      cart_description: order.products?.name || `Order ${order.order_number}`,
      cart_currency: "SAR",
      cart_amount: order.price,
      callback: callbackUrl,
      return: returnUrl,
      customer_details: {
        name: order.customer_name,
        email: order.customer_email || "customer@example.com",
        phone: order.customer_phone || "",
        street1: order.shipping_address || "N/A",
        city: "Riyadh",
        state: "Riyadh",
        country: "SA",
        zip: "00000"
      },
      hide_shipping: true,
      framed: false
    };

    console.log('Creating PayTabs payment:', JSON.stringify(paymentRequest));

    const paytabsResponse = await fetch('https://secure.paytabs.sa/payment/request', {
      method: 'POST',
      headers: {
        'Authorization': serverKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentRequest)
    });

    const paytabsData = await paytabsResponse.json();
    console.log('PayTabs response:', JSON.stringify(paytabsData));

    if (!paytabsData.redirect_url) {
      return new Response(
        JSON.stringify({ error: paytabsData.message || 'Failed to create payment link', details: paytabsData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update order with payment link and transaction reference
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        payment_link: paytabsData.redirect_url,
        payment_status: 'awaiting_payment'
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to update order:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        payment_url: paytabsData.redirect_url,
        tran_ref: paytabsData.tran_ref
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating PayTabs payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
