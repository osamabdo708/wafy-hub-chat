import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain',
};

async function verifyShopifyWebhook(body: string, hmacHeader: string): Promise<boolean> {
  const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET');
  if (!secret) {
    console.log('No SHOPIFY_WEBHOOK_SECRET configured, skipping verification');
    return true;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
    
    return computedHmac === hmacHeader;
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const bodyText = await req.text();
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';
    const topic = req.headers.get('x-shopify-topic') || '';
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';

    console.log(`Shopify webhook received: ${topic} from ${shopDomain}`);

    // Verify webhook signature
    const isValid = await verifyShopifyWebhook(bodyText, hmacHeader);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const payload = JSON.parse(bodyText);

    // Get workspace ID (assuming single workspace for now)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1)
      .single();

    if (!workspace) {
      throw new Error('No workspace found');
    }

    const workspaceId = workspace.id;

    switch (topic) {
      case 'orders/create':
      case 'orders/updated': {
        const order = payload;
        
        const statusMap: Record<string, string> = {
          'pending': 'قيد الانتظار',
          'paid': 'مؤكد',
          'refunded': 'عائد',
          'voided': 'ملغي',
        };

        const fulfillmentMap: Record<string, string> = {
          'fulfilled': 'تم التوصيل',
          'partial': 'قيد التوصيل',
          null: 'تم التغليف جاهز للتوصيل',
        };

        const orderData = {
          workspace_id: workspaceId,
          order_number: `SHOP-${order.order_number}`,
          customer_name: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || 'عميل Shopify',
          customer_email: order.customer?.email || null,
          customer_phone: order.customer?.phone || order.shipping_address?.phone || null,
          price: parseFloat(order.total_price) || 0,
          status: fulfillmentMap[order.fulfillment_status] || statusMap[order.financial_status] || 'قيد الانتظار',
          payment_status: order.financial_status === 'paid' ? 'مدفوع' : 'غير مدفوع',
          shipping_address: order.shipping_address ? 
            `${order.shipping_address.address1 || ''} ${order.shipping_address.address2 || ''}, ${order.shipping_address.city || ''}, ${order.shipping_address.country || ''}` : null,
          // source_platform: 'shopify',
          source_platform: 'المتجر',
          notes: order.note || null,
        };

        // Upsert order
        const { error } = await supabase
          .from('orders')
          .upsert(orderData, { onConflict: 'order_number' });

        if (error) throw error;
        console.log(`Order ${order.order_number} processed successfully`);
        break;
      }

      case 'orders/cancelled': {
        const order = payload;
        await supabase
          .from('orders')
          .update({ status: 'ملغي' })
          .eq('order_number', `SHOP-${order.order_number}`);
        
        console.log(`Order ${order.order_number} cancelled`);
        break;
      }

      case 'products/create':
      case 'products/update': {
        const product = payload;
        const mainVariant = product.variants?.[0] || {};

        const productData = {
          workspace_id: workspaceId,
          name: product.title,
          description: product.body_html?.replace(/<[^>]*>/g, '') || null,
          price: parseFloat(mainVariant.price) || 0,
          stock: product.variants?.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0) || 0,
          image_url: product.images?.[0]?.src || null,
          gallery_images: product.images?.slice(1).map((img: any) => img.src) || [],
          is_active: product.status === 'active',
          category: product.product_type || null,
          attributes: {
            shopify_id: product.id,
            vendor: product.vendor,
            tags: product.tags,
            variants: product.variants?.map((v: any) => ({
              id: v.id,
              title: v.title,
              price: v.price,
              sku: v.sku,
              inventory_quantity: v.inventory_quantity,
            })),
          }
        };

        // Check if product exists
        const { data: existingProduct } = await supabase
          .from('products')
          .select('id')
          .eq('workspace_id', workspaceId)
          .contains('attributes', { shopify_id: product.id })
          .maybeSingle();

        if (existingProduct) {
          await supabase
            .from('products')
            .update(productData)
            .eq('id', existingProduct.id);
        } else {
          await supabase
            .from('products')
            .insert(productData);
        }

        console.log(`Product ${product.title} synced from Shopify`);
        break;
      }

      case 'products/delete': {
        const product = payload;
        
        await supabase
          .from('products')
          .update({ is_active: false })
          .eq('workspace_id', workspaceId)
          .contains('attributes', { shopify_id: product.id });

        console.log(`Product ${product.id} marked as inactive`);
        break;
      }

      default:
        console.log(`Unhandled topic: ${topic}`);
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error('Shopify webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
