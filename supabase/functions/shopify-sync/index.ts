import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShopifyProduct {
  id?: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  status: string;
  variants: ShopifyVariant[];
  images: { src: string }[];
  tags: string;
}

interface ShopifyVariant {
  id?: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
  inventory_quantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

async function shopifyRequest(storeUrl: string, accessToken: string, endpoint: string, method: string = 'GET', body?: any) {
  const url = `https://${storeUrl}/admin/api/2024-01/${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  console.log(`Shopify API: ${method} ${endpoint}`);
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Shopify API error: ${response.status} - ${errorText}`);
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const storeUrl = Deno.env.get('SHOPIFY_STORE_URL');
    const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');

    if (!storeUrl || !accessToken) {
      throw new Error('Shopify credentials not configured');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, workspaceId, productId, data } = await req.json();

    console.log(`Shopify sync action: ${action}, workspaceId: ${workspaceId}`);

    switch (action) {
      case 'test_connection': {
        const shopData = await shopifyRequest(storeUrl, accessToken, 'shop.json');
        return new Response(JSON.stringify({ 
          success: true, 
          shop: shopData.shop 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sync_products_from_shopify': {
        // Get all products from Shopify
        const productsData = await shopifyRequest(storeUrl, accessToken, 'products.json?limit=250');
        const shopifyProducts = productsData.products;

        console.log(`Fetched ${shopifyProducts.length} products from Shopify`);

        const syncedProducts = [];

        for (const sp of shopifyProducts) {
          const mainVariant = sp.variants[0] || {};
          
          // Map Shopify product to our schema
          const productData = {
            workspace_id: workspaceId,
            name: sp.title,
            description: sp.body_html?.replace(/<[^>]*>/g, '') || null,
            price: parseFloat(mainVariant.price) || 0,
            stock: sp.variants.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0),
            image_url: sp.images?.[0]?.src || null,
            gallery_images: sp.images?.slice(1).map((img: any) => img.src) || [],
            is_active: sp.status === 'active',
            category: sp.product_type || null,
            attributes: {
              shopify_id: sp.id,
              vendor: sp.vendor,
              tags: sp.tags,
              variants: sp.variants.map((v: any) => ({
                id: v.id,
                title: v.title,
                price: v.price,
                sku: v.sku,
                inventory_quantity: v.inventory_quantity,
                option1: v.option1,
                option2: v.option2,
                option3: v.option3,
              })),
              options: sp.options,
            }
          };

          // Check if product with this Shopify ID exists
          const { data: existingProduct } = await supabase
            .from('products')
            .select('id')
            .eq('workspace_id', workspaceId)
            .contains('attributes', { shopify_id: sp.id })
            .maybeSingle();

          if (existingProduct) {
            const { data: updated, error } = await supabase
              .from('products')
              .update(productData)
              .eq('id', existingProduct.id)
              .select()
              .single();
            
            if (error) throw error;
            syncedProducts.push({ ...updated, action: 'updated' });
          } else {
            const { data: created, error } = await supabase
              .from('products')
              .insert(productData)
              .select()
              .single();
            
            if (error) throw error;
            syncedProducts.push({ ...created, action: 'created' });
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          synced: syncedProducts.length,
          products: syncedProducts 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sync_product_to_shopify': {
        // Get product from database
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('*, categories(name)')
          .eq('id', productId)
          .single();

        if (productError) throw productError;

        const shopifyProduct: any = {
          product: {
            title: product.name,
            body_html: product.description || '',
            vendor: 'My Store',
            product_type: product.categories?.name || product.category || '',
            status: product.is_active ? 'active' : 'draft',
            variants: [{
              price: product.price.toString(),
              inventory_management: 'shopify',
              inventory_quantity: product.stock || 0,
            }],
            images: []
          }
        };

        // Add images
        if (product.image_url) {
          shopifyProduct.product.images.push({ src: product.image_url });
        }
        if (product.gallery_images) {
          product.gallery_images.forEach((url: string) => {
            shopifyProduct.product.images.push({ src: url });
          });
        }

        let result;
        const shopifyId = product.attributes?.shopify_id;

        if (shopifyId) {
          // Update existing product
          result = await shopifyRequest(storeUrl, accessToken, `products/${shopifyId}.json`, 'PUT', shopifyProduct);
        } else {
          // Create new product
          result = await shopifyRequest(storeUrl, accessToken, 'products.json', 'POST', shopifyProduct);
          
          // Save Shopify ID back to our database
          await supabase
            .from('products')
            .update({ 
              attributes: { 
                ...product.attributes, 
                shopify_id: result.product.id 
              } 
            })
            .eq('id', productId);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          product: result.product 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sync_all_products_to_shopify': {
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('*, categories(name)')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true);

        if (productsError) throw productsError;

        const results = [];
        for (const product of products || []) {
          try {
            const shopifyProduct: any = {
              product: {
                title: product.name,
                body_html: product.description || '',
                vendor: 'My Store',
                product_type: product.categories?.name || product.category || '',
                status: 'active',
                variants: [{
                  price: product.price.toString(),
                  inventory_management: 'shopify',
                  inventory_quantity: product.stock || 0,
                }],
                images: []
              }
            };

            if (product.image_url) {
              shopifyProduct.product.images.push({ src: product.image_url });
            }

            const shopifyId = product.attributes?.shopify_id;
            let result;

            if (shopifyId) {
              result = await shopifyRequest(storeUrl, accessToken, `products/${shopifyId}.json`, 'PUT', shopifyProduct);
            } else {
              result = await shopifyRequest(storeUrl, accessToken, 'products.json', 'POST', shopifyProduct);
              
              await supabase
                .from('products')
                .update({ 
                  attributes: { 
                    ...product.attributes, 
                    shopify_id: result.product.id 
                  } 
                })
                .eq('id', product.id);
            }

            results.push({ id: product.id, success: true, shopifyId: result.product.id });
          } catch (err: any) {
            results.push({ id: product.id, success: false, error: err.message });
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          results 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sync_categories_to_shopify': {
        // Shopify uses product_type for categories - we'll sync by setting product types
        const { data: categories, error: catError } = await supabase
          .from('categories')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true);

        if (catError) throw catError;

        // Shopify doesn't have a separate categories API, product_type is used
        // We'll create smart collections based on product types
        const results = [];
        
        for (const category of categories || []) {
          try {
            // Create a smart collection for each category
            const collection = {
              smart_collection: {
                title: category.name,
                rules: [{
                  column: 'type',
                  relation: 'equals',
                  condition: category.name
                }],
                disjunctive: false,
                published: true
              }
            };

            const result = await shopifyRequest(storeUrl, accessToken, 'smart_collections.json', 'POST', collection);
            results.push({ category: category.name, success: true, collectionId: result.smart_collection?.id });
          } catch (err: any) {
            // Collection might already exist
            results.push({ category: category.name, success: false, error: err.message });
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          results 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sync_shipping_methods_to_shopify': {
        // Get shipping methods
        const { data: shippingMethods, error: shipError } = await supabase
          .from('shipping_methods')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true);

        if (shipError) throw shipError;

        // Note: Shopify shipping is managed via Carrier Services API (requires Shopify Plus)
        // For standard stores, we return the shipping methods for manual setup
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Shipping methods require manual setup in Shopify Admin',
          shippingMethods: shippingMethods 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'sync_orders_from_shopify': {
        // Get orders from Shopify
        const ordersData = await shopifyRequest(storeUrl, accessToken, 'orders.json?status=any&limit=250');
        const shopifyOrders = ordersData.orders;

        console.log(`Fetched ${shopifyOrders.length} orders from Shopify`);

        const syncedOrders = [];

        for (const so of shopifyOrders) {
          // Check if order already exists
          const { data: existingOrder } = await supabase
            .from('orders')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('order_number', `SHOP-${so.order_number}`)
            .maybeSingle();

          if (existingOrder) {
            syncedOrders.push({ id: existingOrder.id, action: 'skipped' });
            continue;
          }

          // Map Shopify order status to our status
          const statusMap: Record<string, string> = {
            'pending': 'قيد الانتظار',
            'open': 'مؤكد',
            'closed': 'مكتمل',
            'cancelled': 'ملغي',
            'fulfilled': 'تم التوصيل',
            'unfulfilled': 'تم التغليف جاهز للتوصيل',
          };

          const orderData = {
            workspace_id: workspaceId,
            order_number: `SHOP-${so.order_number}`,
            customer_name: `${so.customer?.first_name || ''} ${so.customer?.last_name || ''}`.trim() || 'عميل Shopify',
            customer_email: so.customer?.email || null,
            customer_phone: so.customer?.phone || so.shipping_address?.phone || null,
            price: parseFloat(so.total_price) || 0,
            status: statusMap[so.financial_status] || statusMap[so.fulfillment_status] || 'قيد الانتظار',
            payment_status: so.financial_status === 'paid' ? 'مدفوع' : 'غير مدفوع',
            shipping_address: so.shipping_address ? 
              `${so.shipping_address.address1 || ''} ${so.shipping_address.address2 || ''}, ${so.shipping_address.city || ''}, ${so.shipping_address.country || ''}` : null,
            source_platform: 'shopify',
            notes: so.note || null,
          };

          const { data: created, error } = await supabase
            .from('orders')
            .insert(orderData)
            .select()
            .single();

          if (error) {
            console.error('Error creating order:', error);
            continue;
          }

          syncedOrders.push({ ...created, action: 'created' });
        }

        return new Response(JSON.stringify({ 
          success: true, 
          synced: syncedOrders.filter(o => o.action === 'created').length,
          orders: syncedOrders 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error('Shopify sync error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
