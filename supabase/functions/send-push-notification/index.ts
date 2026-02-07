import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get Google OAuth2 access token from service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedClaims = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signInput = `${encodedHeader}.${encodedClaims}`;

  // Import the private key
  const pemKey = serviceAccount.private_key;
  const pemContents = pemKey.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signInput}.${encodedSignature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    console.error('Failed to get access token:', tokenData);
    throw new Error('Failed to get Firebase access token');
  }
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firebaseJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');

    if (!firebaseJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not configured');
    }

    const serviceAccount = JSON.parse(firebaseJson);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { title, body, data, workspace_id } = await req.json();

    console.log(`Sending push notification: "${title}" to workspace ${workspace_id}`);

    // Get all device tokens for users in this workspace
    // First get all users who own this workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('owner_user_id')
      .eq('id', workspace_id)
      .single();

    if (!workspace) {
      console.log('No workspace found');
      return new Response(JSON.stringify({ success: false, error: 'Workspace not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all device tokens for the workspace owner
    const { data: tokens, error: tokensError } = await supabase
      .from('device_tokens')
      .select('fcm_token')
      .eq('user_id', workspace.owner_user_id);

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      throw tokensError;
    }

    if (!tokens || tokens.length === 0) {
      console.log('No device tokens found for workspace owner');
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${tokens.length} device tokens`);

    // Get FCM access token
    const accessToken = await getAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    let successCount = 0;
    let failCount = 0;
    const invalidTokens: string[] = [];

    for (const tokenRecord of tokens) {
      try {
        const message = {
          message: {
            token: tokenRecord.fcm_token,
            notification: { title, body },
            data: data || {},
            android: {
              priority: 'high' as const,
              notification: {
                sound: 'default',
                channel_id: 'almared_notifications',
              },
            },
          },
        };

        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          }
        );

        const result = await response.json();

        if (response.ok) {
          successCount++;
          console.log(`Push sent successfully to token ${tokenRecord.fcm_token.substring(0, 10)}...`);
        } else {
          failCount++;
          console.error(`FCM error for token:`, result);
          // If token is invalid, mark for removal
          if (result.error?.code === 404 || result.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')) {
            invalidTokens.push(tokenRecord.fcm_token);
          }
        }
      } catch (err) {
        failCount++;
        console.error(`Error sending to token:`, err);
      }
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      console.log(`Removing ${invalidTokens.length} invalid tokens`);
      await supabase
        .from('device_tokens')
        .delete()
        .in('fcm_token', invalidTokens);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      sent: successCount, 
      failed: failCount,
      cleaned: invalidTokens.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
