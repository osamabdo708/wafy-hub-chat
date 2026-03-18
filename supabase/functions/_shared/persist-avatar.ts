// Helper to download a profile picture from an external URL and persist it to Supabase Storage
// Returns the permanent public URL, or the original URL if upload fails

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Downloads an avatar from a temporary URL (e.g. Meta CDN) and uploads it to Supabase Storage.
 * Returns the permanent public URL. Falls back to original URL on failure.
 * 
 * @param externalUrl - The temporary profile picture URL
 * @param uniqueKey - A unique identifier (e.g. `facebook_12345` or `instagram_67890`)
 */
export async function persistAvatar(
  externalUrl: string,
  uniqueKey: string
): Promise<string> {
  if (!externalUrl) return externalUrl;

  // Skip WhatsApp external avatar service URLs (they don't expire)
  if (externalUrl.includes('checkleaked.com')) {
    return externalUrl;
  }

  // Skip if it's already our storage URL (but allow force refresh via 3rd param)
  if (externalUrl.includes(SUPABASE_URL) && externalUrl.includes('client-avatars')) {
    return externalUrl;
  }

  try {
    console.log(`[PERSIST-AVATAR] Downloading avatar for ${uniqueKey}`);
    
    const response = await fetch(externalUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[PERSIST-AVATAR] Download failed: ${response.status}`);
      return externalUrl;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filePath = `${uniqueKey}.${ext}`;

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase.storage
      .from('client-avatars')
      .upload(filePath, uint8Array, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error(`[PERSIST-AVATAR] Upload error:`, error.message);
      return externalUrl;
    }

    const { data: publicUrlData } = supabase.storage
      .from('client-avatars')
      .getPublicUrl(filePath);

    // Add cache-busting timestamp to force browsers to reload
    const permanentUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    console.log(`[PERSIST-AVATAR] ✅ Avatar persisted: ${permanentUrl}`);
    return permanentUrl;
  } catch (e: any) {
    console.error(`[PERSIST-AVATAR] Error:`, e?.message || e);
    return externalUrl;
  }
}
