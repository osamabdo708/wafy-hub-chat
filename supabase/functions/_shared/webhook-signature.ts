// Webhook signature verification for Meta platforms

import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

export function verifyMetaSignature(
  payload: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) {
    console.error("[SIGNATURE] No signature provided");
    return false;
  }

  // Meta sends signature as "sha256=<hash>"
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    console.error("[SIGNATURE] Invalid signature format");
    return false;
  }

  const providedHash = signature.slice(expectedPrefix.length);
  
  // Calculate expected hash
  const hmac = createHmac("sha256", appSecret);
  hmac.update(payload);
  const expectedHash = hmac.digest("hex");

  // Constant-time comparison
  if (providedHash.length !== expectedHash.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < providedHash.length; i++) {
    result |= providedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  
  return result === 0;
}

// Generate CSRF state token
export function generateState(workspaceId: string, provider: string): string {
  const data = {
    workspaceId,
    provider,
    timestamp: Date.now(),
    nonce: crypto.randomUUID()
  };
  return btoa(JSON.stringify(data));
}

// Validate and parse state token
export function parseState(state: string): { workspaceId: string; provider: string; timestamp: number } | null {
  try {
    const data = JSON.parse(atob(state));
    
    // Check if state is not too old (15 minutes max)
    const maxAge = 15 * 60 * 1000; // 15 minutes
    if (Date.now() - data.timestamp > maxAge) {
      console.error("[STATE] State token expired");
      return null;
    }
    
    return data;
  } catch (e) {
    console.error("[STATE] Failed to parse state:", e);
    return null;
  }
}
