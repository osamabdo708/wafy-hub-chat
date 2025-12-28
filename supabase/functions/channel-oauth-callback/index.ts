import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_APP_ID = Deno.env.get("META_APP_ID") || Deno.env.get("FACEBOOK_APP_ID") || "1749195285754662";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || Deno.env.get("FACEBOOK_APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/**
 * UNIFIED OAUTH CALLBACK
 * 
 * Handles OAuth callbacks for all Meta channels:
 * - Facebook Messenger (pages)
 * - Instagram (business accounts)
 * - WhatsApp Business (phone numbers)
 * 
 * Each channel is INDEPENDENT:
 * - Facebook and Instagram are stored separately
 * - User can connect IG from any Meta account (doesn't need to match FB page)
 * - Tokens never override each other
 * - Each channel gets its own row in channel_integrations
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log("[CHANNEL-OAUTH] Callback received:", { code: !!code, state, error });

    if (error) {
      console.error("[CHANNEL-OAUTH] Error:", error, errorDescription);
      return errorResponse(errorDescription || error);
    }

    if (!code) {
      return errorResponse('Missing authorization code');
    }

    // Parse state: channelType|redirectUri|workspaceId
    let channelType = "facebook";
    let redirectUri = `${SUPABASE_URL}/functions/v1/channel-oauth-callback`;
    let workspaceId: string | null = null;

    if (state) {
      const parts = state.split("|");
      channelType = parts[0] || "facebook";
      if (parts[1]) redirectUri = parts[1];
      if (parts[2]) workspaceId = parts[2];
    }

    console.log("[CHANNEL-OAUTH] Channel:", channelType, "WorkspaceId:", workspaceId);

    if (!workspaceId) {
      return errorResponse('Missing workspace ID');
    }

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${META_APP_SECRET}&code=${code}`;
    
    console.log("[CHANNEL-OAUTH] Exchanging code for token...");
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("[CHANNEL-OAUTH] Token exchange error:", tokenData.error);
      return errorResponse(tokenData.error.message);
    }

    const accessToken = tokenData.access_token;
    console.log("[CHANNEL-OAUTH] Got access token");

    // Exchange for long-lived token
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${accessToken}`;
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();
    const longLivedToken = longLivedData.access_token || accessToken;
    console.log("[CHANNEL-OAUTH] Got long-lived token");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Route to appropriate handler
    switch (channelType) {
      case 'facebook':
        return await handleFacebookConnect(supabase, longLivedToken, workspaceId);
      case 'instagram':
        return await handleInstagramConnect(supabase, longLivedToken, workspaceId);
      case 'whatsapp':
        return await handleWhatsAppConnect(supabase, longLivedToken, workspaceId);
      default:
        return errorResponse(`Unknown channel type: ${channelType}`);
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[CHANNEL-OAUTH] Error:", error);
    return errorResponse(errorMessage);
  }
});

// ============================================
// FACEBOOK MESSENGER CONNECTION
// ============================================
async function handleFacebookConnect(supabase: any, accessToken: string, workspaceId: string) {
  console.log("[CHANNEL-OAUTH] Connecting Facebook Messenger...");

  // Get user's Facebook pages
  const pagesResponse = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
  );
  const pagesData = await pagesResponse.json();
  console.log("[CHANNEL-OAUTH] Pages data:", JSON.stringify(pagesData));

  if (!pagesData.data || pagesData.data.length === 0) {
    return errorResponse('No Facebook pages found. Please ensure you have admin access to at least one page.');
  }

  const page = pagesData.data[0];
  const pageId = page.id;
  const pageAccessToken = page.access_token;
  const pageName = page.name;

  // Subscribe page to webhook
  await subscribeToWebhook(pageId, pageAccessToken, 'facebook');

  // Store configuration - ONLY for Facebook, SEPARATE from Instagram
  const config = {
    page_id: pageId,
    page_access_token: pageAccessToken,
    page_name: pageName,
    access_token: accessToken,
    connected_at: new Date().toISOString(),
    webhook_subscribed: true
  };

  // Upsert: Update if exists for this workspace, otherwise insert
  const { data: existing } = await supabase
    .from('channel_integrations')
    .select('id')
    .eq('channel', 'facebook')
    .eq('workspace_id', workspaceId)
    .eq('account_id', pageId)
    .maybeSingle();

  let saveError: any = null;

  if (existing) {
    console.log("[CHANNEL-OAUTH] Updating existing Facebook connection");
    const { error } = await supabase
      .from('channel_integrations')
      .update({
        is_connected: true,
        config,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    saveError = error;
  } else {
    console.log("[CHANNEL-OAUTH] Creating new Facebook connection");
    const { error } = await supabase
      .from('channel_integrations')
      .insert({
        channel: 'facebook',
        account_id: pageId,
        workspace_id: workspaceId,
        is_connected: true,
        config
      });
    saveError = error;
  }

  if (saveError) {
    console.error("[CHANNEL-OAUTH] Database error:", saveError);
    return errorResponse(`Database error: ${saveError.message}`);
  }

  console.log("[CHANNEL-OAUTH] ✅ Facebook Messenger connected for workspace:", workspaceId);
  return successResponse('facebook', pageName);
}

// ============================================
// INSTAGRAM CONNECTION (INDEPENDENT)
// ============================================
async function handleInstagramConnect(supabase: any, accessToken: string, workspaceId: string) {
  console.log("[CHANNEL-OAUTH] Connecting Instagram...");

  // Get user's Facebook pages (needed to access Instagram Business Accounts)
  const pagesResponse = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
  );
  const pagesData = await pagesResponse.json();
  console.log("[CHANNEL-OAUTH] Pages for Instagram lookup:", JSON.stringify(pagesData));

  if (!pagesData.data || pagesData.data.length === 0) {
    return errorResponse('No Facebook pages found. Instagram Business accounts must be linked to a Facebook page.');
  }

  // Find a page with Instagram Business Account
  let instagramAccountId: string | null = null;
  let instagramUsername: string | null = null;
  let pageAccessToken: string | null = null;
  let linkedPageId: string | null = null;

  for (const page of pagesData.data) {
    const igResponse = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );
    const igData = await igResponse.json();
    
    if (igData.instagram_business_account) {
      instagramAccountId = igData.instagram_business_account.id;
      pageAccessToken = page.access_token;
      linkedPageId = page.id;

      // Get Instagram username
      const igInfoResponse = await fetch(
        `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=username,name,profile_picture_url&access_token=${page.access_token}`
      );
      const igInfo = await igInfoResponse.json();
      instagramUsername = igInfo.username || igInfo.name;
      
      console.log("[CHANNEL-OAUTH] Found Instagram account:", instagramUsername);
      break;
    }
  }

  if (!instagramAccountId) {
    return errorResponse('No Instagram Business Account found. Please ensure your Instagram account is connected to a Facebook page as a Business or Creator account.');
  }

  // Subscribe to webhook
  if (linkedPageId && pageAccessToken) {
    await subscribeToWebhook(linkedPageId, pageAccessToken, 'instagram');
  }

  // Store configuration - ONLY for Instagram, SEPARATE from Facebook
  const config = {
    instagram_account_id: instagramAccountId,
    account_name: instagramUsername,
    page_id: linkedPageId,
    page_access_token: pageAccessToken,
    access_token: accessToken,
    connected_at: new Date().toISOString(),
    webhook_subscribed: true
  };

  // Upsert: Update if exists for this workspace, otherwise insert
  const { data: existing } = await supabase
    .from('channel_integrations')
    .select('id')
    .eq('channel', 'instagram')
    .eq('workspace_id', workspaceId)
    .eq('account_id', instagramAccountId)
    .maybeSingle();

  let saveError: any = null;

  if (existing) {
    console.log("[CHANNEL-OAUTH] Updating existing Instagram connection");
    const { error } = await supabase
      .from('channel_integrations')
      .update({
        is_connected: true,
        config,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    saveError = error;
  } else {
    console.log("[CHANNEL-OAUTH] Creating new Instagram connection");
    const { error } = await supabase
      .from('channel_integrations')
      .insert({
        channel: 'instagram',
        account_id: instagramAccountId,
        workspace_id: workspaceId,
        is_connected: true,
        config
      });
    saveError = error;
  }

  if (saveError) {
    console.error("[CHANNEL-OAUTH] Database error:", saveError);
    return errorResponse(`Database error: ${saveError.message}`);
  }

  console.log("[CHANNEL-OAUTH] ✅ Instagram connected for workspace:", workspaceId);
  return successResponse('instagram', instagramUsername ? `@${instagramUsername}` : 'Instagram Account');
}

// ============================================
// WHATSAPP CONNECTION (INDEPENDENT)
// ============================================
async function handleWhatsAppConnect(supabase: any, accessToken: string, workspaceId: string) {
  console.log("[CHANNEL-OAUTH] Connecting WhatsApp...");

  let phoneNumberId: string | null = null;
  let waId: string | null = null;
  let displayName: string = 'WhatsApp Business';
  let phoneNumber: string | null = null;

  // Try multiple approaches to get WhatsApp info
  
  // Approach 1: Get from shared WhatsApp Business Account IDs (new method)
  try {
    const sharedWabaResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/whatsapp_business_accounts?access_token=${accessToken}`
    );
    const sharedWabaData = await sharedWabaResponse.json();
    console.log("[CHANNEL-OAUTH] Shared WABA:", JSON.stringify(sharedWabaData));
    
    if (sharedWabaData.data && sharedWabaData.data.length > 0) {
      waId = sharedWabaData.data[0].id;
      
      // Get phone numbers from this WABA
      const phonesResponse = await fetch(
        `https://graph.facebook.com/v21.0/${waId}/phone_numbers?access_token=${accessToken}`
      );
      const phonesData = await phonesResponse.json();
      console.log("[CHANNEL-OAUTH] Phone numbers from shared WABA:", JSON.stringify(phonesData));

      if (phonesData.data && phonesData.data.length > 0) {
        phoneNumberId = phonesData.data[0].id;
        phoneNumber = phonesData.data[0].display_phone_number;
        displayName = phonesData.data[0].verified_name || phoneNumber || 'WhatsApp Business';
      }
    }
  } catch (e) {
    console.log("[CHANNEL-OAUTH] Error getting shared WABA:", e);
  }

  // Approach 2: Get from business accounts (old method)
  if (!phoneNumberId && !waId) {
    try {
      const wabaResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?access_token=${accessToken}`
      );
      const wabaData = await wabaResponse.json();
      console.log("[CHANNEL-OAUTH] Businesses:", JSON.stringify(wabaData));

      if (wabaData.data && wabaData.data.length > 0) {
        for (const business of wabaData.data) {
          const waAccountResponse = await fetch(
            `https://graph.facebook.com/v21.0/${business.id}/owned_whatsapp_business_accounts?access_token=${accessToken}`
          );
          const waAccountData = await waAccountResponse.json();
          console.log("[CHANNEL-OAUTH] WhatsApp accounts for business", business.id, ":", JSON.stringify(waAccountData));

          if (waAccountData.data && waAccountData.data.length > 0) {
            waId = waAccountData.data[0].id;
            
            const phonesResponse = await fetch(
              `https://graph.facebook.com/v21.0/${waId}/phone_numbers?access_token=${accessToken}`
            );
            const phonesData = await phonesResponse.json();
            console.log("[CHANNEL-OAUTH] Phone numbers:", JSON.stringify(phonesData));

            if (phonesData.data && phonesData.data.length > 0) {
              phoneNumberId = phonesData.data[0].id;
              phoneNumber = phonesData.data[0].display_phone_number;
              displayName = phonesData.data[0].verified_name || phoneNumber || 'WhatsApp Business';
              break;
            }
          }
        }
      }
    } catch (e) {
      console.log("[CHANNEL-OAUTH] Error getting businesses:", e);
    }
  }

  // Approach 3: Try debug_token to get connected assets
  if (!phoneNumberId && !waId) {
    try {
      const debugResponse = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`
      );
      const debugData = await debugResponse.json();
      console.log("[CHANNEL-OAUTH] Debug token data:", JSON.stringify(debugData));
      
      // Check for WhatsApp in granular_scopes
      const granularScopes = debugData.data?.granular_scopes || [];
      for (const scope of granularScopes) {
        if (scope.scope === 'whatsapp_business_messaging' && scope.target_ids?.length > 0) {
          waId = scope.target_ids[0];
          console.log("[CHANNEL-OAUTH] Found WABA ID from scopes:", waId);
          
          // Try to get phone numbers
          const phonesResponse = await fetch(
            `https://graph.facebook.com/v21.0/${waId}/phone_numbers?access_token=${accessToken}`
          );
          const phonesData = await phonesResponse.json();
          console.log("[CHANNEL-OAUTH] Phone numbers from scopes WABA:", JSON.stringify(phonesData));

          if (phonesData.data && phonesData.data.length > 0) {
            phoneNumberId = phonesData.data[0].id;
            phoneNumber = phonesData.data[0].display_phone_number;
            displayName = phonesData.data[0].verified_name || phoneNumber || 'WhatsApp Business';
          }
          break;
        }
      }
    } catch (e) {
      console.log("[CHANNEL-OAUTH] Error debugging token:", e);
    }
  }

  console.log("[CHANNEL-OAUTH] Final WhatsApp info - waId:", waId, "phoneNumberId:", phoneNumberId, "displayName:", displayName);

  // Store configuration
  const config = {
    wa_id: waId,
    phone_number_id: phoneNumberId,
    phone_number: phoneNumber,
    display_name: displayName,
    access_token: accessToken,
    connected_at: new Date().toISOString()
  };

  const accountId = phoneNumberId || waId || `wa_${workspaceId}`;

  // Upsert
  const { data: existing } = await supabase
    .from('channel_integrations')
    .select('id')
    .eq('channel', 'whatsapp')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  let saveError: any = null;

  if (existing) {
    console.log("[CHANNEL-OAUTH] Updating existing WhatsApp connection");
    const { error } = await supabase
      .from('channel_integrations')
      .update({
        is_connected: true,
        account_id: accountId,
        config,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    saveError = error;
  } else {
    console.log("[CHANNEL-OAUTH] Creating new WhatsApp connection");
    const { error } = await supabase
      .from('channel_integrations')
      .insert({
        channel: 'whatsapp',
        account_id: accountId,
        workspace_id: workspaceId,
        is_connected: true,
        config
      });
    saveError = error;
  }

  if (saveError) {
    console.error("[CHANNEL-OAUTH] Database error:", saveError);
    return errorResponse(`Database error: ${saveError.message}`);
  }

  console.log("[CHANNEL-OAUTH] ✅ WhatsApp connected for workspace:", workspaceId);
  
  // Show message about manual webhook setup if no phone number ID found
  if (!phoneNumberId) {
    return successResponse('whatsapp', displayName + ' (Manual webhook setup required)');
  }
  
  return successResponse('whatsapp', displayName);
}

// ============================================
// HELPER: Subscribe to Webhook
// ============================================
async function subscribeToWebhook(pageId: string, pageAccessToken: string, channel: string) {
  const subscribeFields = channel === 'instagram'
    ? "messages,messaging_postbacks"
    : "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads";

  console.log("[CHANNEL-OAUTH] Subscribing to webhook with fields:", subscribeFields);

  const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`;
  const subscribeResponse = await fetch(subscribeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: pageAccessToken,
      subscribed_fields: subscribeFields
    })
  });
  const subscribeData = await subscribeResponse.json();
  
  if (subscribeData.error) {
    console.error("[CHANNEL-OAUTH] Webhook subscription failed:", subscribeData.error);
  } else {
    console.log("[CHANNEL-OAUTH] ✅ Webhook subscription successful");
  }
}

// ============================================
// HELPER: Response Builders
// ============================================
function successResponse(channel: string, accountName: string) {
  return new Response(
    `<html><body><script>window.opener.postMessage({type:'oauth_success',channel:'${channel}',account:'${accountName}'},'*');window.close();</script></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

function errorResponse(message: string) {
  const safeMessage = message.replace(/'/g, "\\'");
  return new Response(
    `<html><body><script>window.opener.postMessage({type:'oauth_error',error:'${safeMessage}'},'*');window.close();</script></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
