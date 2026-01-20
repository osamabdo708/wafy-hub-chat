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
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const shop = url.searchParams.get('shop');
    const state = url.searchParams.get('state'); // Contains workspaceId
    const hmac = url.searchParams.get('hmac');

    console.log('Shopify OAuth callback received:', { shop, code: !!code, state });

    if (!code || !shop || !state) {
      return new Response(renderErrorPage('Missing required parameters'), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get Shopify settings to retrieve API key and secret
    const { data: settings, error: settingsError } = await supabase
      .from('shopify_settings')
      .select('*')
      .eq('workspace_id', state)
      .maybeSingle();

    if (settingsError || !settings) {
      console.error('Settings error:', settingsError);
      return new Response(renderErrorPage('Shopify settings not found. Please configure API credentials first.'), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    const apiKey = settings.api_key;
    const apiSecret = settings.api_secret_encrypted; // In production, decrypt this

    if (!apiKey || !apiSecret) {
      return new Response(renderErrorPage('API Key and Secret are required'), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    // Exchange code for access token
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return new Response(renderErrorPage(`Failed to get access token: ${errorText}`), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    console.log('Access token obtained successfully');

    // Get shop info
    const shopResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    let shopInfo = { name: shop, domain: shop, email: '', currency: 'USD' };
    if (shopResponse.ok) {
      const shopData = await shopResponse.json();
      shopInfo = {
        name: shopData.shop.name,
        domain: shopData.shop.domain,
        email: shopData.shop.email,
        currency: shopData.shop.currency,
      };
    }

    // Update shopify_settings with access token and shop info
    const { error: updateError } = await supabase
      .from('shopify_settings')
      .update({
        store_url: shop,
        access_token_encrypted: accessToken, // In production, encrypt this
        shop_name: shopInfo.name,
        shop_domain: shopInfo.domain,
        shop_email: shopInfo.email,
        shop_currency: shopInfo.currency,
        is_connected: true,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', state);

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(renderErrorPage('Failed to save settings'), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    console.log('Shopify settings updated successfully');

    // Return success page that closes the popup
    return new Response(renderSuccessPage(shopInfo.name), {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });

  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return new Response(renderErrorPage(error.message), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });
  }
});

function renderSuccessPage(shopName: string): string {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تم الاتصال بنجاح</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: white;
          padding: 3rem;
          border-radius: 1rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          text-align: center;
          max-width: 400px;
        }
        .icon {
          width: 80px;
          height: 80px;
          background: #10b981;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
        }
        .icon svg { width: 40px; height: 40px; color: white; }
        h1 { color: #1f2937; margin-bottom: 0.5rem; font-size: 1.5rem; }
        p { color: #6b7280; margin-bottom: 1rem; }
        .shop-name { font-weight: 600; color: #4f46e5; }
        .note { font-size: 0.875rem; color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h1>تم الاتصال بنجاح!</h1>
        <p>تم ربط متجر <span class="shop-name">${shopName}</span> بنجاح</p>
        <p class="note">سيتم إغلاق هذه النافذة تلقائياً...</p>
      </div>
      <script>
        setTimeout(() => {
          if (window.opener) {
            window.opener.postMessage({ type: 'shopify_oauth_success', shop: '${shopName}' }, '*');
          }
          window.close();
        }, 2000);
      </script>
    </body>
    </html>
  `;
}

function renderErrorPage(error: string): string {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>خطأ في الاتصال</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: white;
          padding: 3rem;
          border-radius: 1rem;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          text-align: center;
          max-width: 400px;
        }
        .icon {
          width: 80px;
          height: 80px;
          background: #ef4444;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
        }
        .icon svg { width: 40px; height: 40px; color: white; }
        h1 { color: #1f2937; margin-bottom: 0.5rem; font-size: 1.5rem; }
        p { color: #6b7280; margin-bottom: 1rem; }
        .error { background: #fef2f2; padding: 1rem; border-radius: 0.5rem; color: #dc2626; font-size: 0.875rem; direction: ltr; }
        button {
          margin-top: 1rem;
          padding: 0.75rem 1.5rem;
          background: #4f46e5;
          color: white;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 1rem;
        }
        button:hover { background: #4338ca; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>
        <h1>فشل الاتصال</h1>
        <p>حدث خطأ أثناء محاولة الاتصال بـ Shopify</p>
        <div class="error">${error}</div>
        <button onclick="window.close()">إغلاق</button>
      </div>
    </body>
    </html>
  `;
}
