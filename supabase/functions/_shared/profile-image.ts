import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Downloads a profile image from an external URL and uploads it to Supabase Storage.
 * Returns the public URL of the stored image.
 * If the image hasn't changed (same ETag/hash), returns the existing URL.
 */
export async function storeProfileImage(
  supabase: ReturnType<typeof createClient>,
  options: {
    externalUrl: string;
    senderId: string;
    channel: string;
    workspaceId: string;
    existingAvatarUrl?: string | null;
  }
): Promise<string | null> {
  const { externalUrl, senderId, channel, workspaceId, existingAvatarUrl } = options;

  if (!externalUrl) return existingAvatarUrl || null;

  try {
    // Download the image with timeout
    const response = await fetch(externalUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log(`[PROFILE-IMAGE] Failed to download image: ${response.status}`);
      return existingAvatarUrl || null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const imageData = await response.arrayBuffer();

    if (imageData.byteLength < 100) {
      console.log("[PROFILE-IMAGE] Image too small, skipping");
      return existingAvatarUrl || null;
    }

    // Create a simple hash from image data to detect changes
    const hashArray = new Uint8Array(imageData);
    let hash = 0;
    for (let i = 0; i < Math.min(hashArray.length, 1000); i++) {
      hash = ((hash << 5) - hash + hashArray[i]) | 0;
    }
    const hashStr = Math.abs(hash).toString(36);

    // Determine file extension
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const filePath = `${workspaceId}/${channel}/${senderId}_${hashStr}.${ext}`;

    // Check if this exact file already exists (same hash = same image)
    if (existingAvatarUrl && existingAvatarUrl.includes(`${senderId}_${hashStr}`)) {
      console.log("[PROFILE-IMAGE] Image unchanged, keeping existing URL");
      return existingAvatarUrl;
    }

    // Delete old images for this sender
    const { data: existingFiles } = await supabase.storage
      .from("client-avatars")
      .list(`${workspaceId}/${channel}`, {
        search: senderId,
      });

    if (existingFiles && existingFiles.length > 0) {
      const oldPaths = existingFiles.map(
        (f: any) => `${workspaceId}/${channel}/${f.name}`
      );
      await supabase.storage.from("client-avatars").remove(oldPaths);
      console.log(`[PROFILE-IMAGE] Removed ${oldPaths.length} old avatar(s)`);
    }

    // Upload new image
    const { error: uploadError } = await supabase.storage
      .from("client-avatars")
      .upload(filePath, imageData, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[PROFILE-IMAGE] Upload error:", uploadError);
      return existingAvatarUrl || null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("client-avatars")
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData?.publicUrl;
    console.log(`[PROFILE-IMAGE] Stored avatar for ${channel}/${senderId}: ${publicUrl}`);

    return publicUrl || existingAvatarUrl || null;
  } catch (e) {
    console.error("[PROFILE-IMAGE] Error:", e);
    return existingAvatarUrl || null;
  }
}
