// Message router for detecting platform and routing to correct workspace

export interface DetectedSource {
  provider: string;
  channelId: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  messageId: string;
  messageText: string;
  timestamp: number;
  isEcho?: boolean;
}

// Detect Meta platform and extract identifiers from webhook payload
export function detectMetaSource(payload: any): DetectedSource | null {
  try {
    const entry = payload.entry?.[0];
    if (!entry) return null;

    // Check for WhatsApp
    const changes = entry.changes?.[0];
    if (changes?.field === "messages") {
      const value = changes.value;
      const message = value.messages?.[0];
      if (message) {
        return {
          provider: "whatsapp",
          channelId: value.metadata?.phone_number_id || value.phone_number_id,
          conversationId: message.from, // Customer phone number
          senderId: message.from,
          senderName: value.contacts?.[0]?.profile?.name,
          messageId: message.id,
          messageText: message.text?.body || message.caption || "[Media]",
          timestamp: parseInt(message.timestamp) * 1000,
          isEcho: false
        };
      }
    }

    // Check for Facebook/Instagram Messaging
    if (entry.messaging) {
      const messaging = entry.messaging[0];
      const pageId = entry.id;
      
      // Determine platform by webhook object type
      let provider = "facebook";
      if (payload.object === "instagram") {
        provider = "instagram";
      } else if (payload.object === "page" || payload.object === "feed") {
        provider = "facebook";
      }
      
      if (messaging.message) {
        const isEcho = messaging.message.is_echo === true;
        return {
          provider,
          channelId: pageId,
          conversationId: isEcho ? messaging.recipient.id : messaging.sender.id,
          senderId: messaging.sender.id,
          messageId: messaging.message.mid,
          messageText: messaging.message.text || "[Media]",
          timestamp: messaging.timestamp,
          isEcho
        };
      }
    }

    return null;
  } catch (e) {
    console.error("[ROUTER] Failed to detect source:", e);
    return null;
  }
}

// Get user info from Meta API
export async function getMetaUserInfo(
  userId: string, 
  accessToken: string,
  provider: string
): Promise<{ name: string; profilePic?: string } | null> {
  try {
    console.log(`[ROUTER] Fetching user info for ${provider} user: ${userId}`);
    
    // For Instagram, we need to use the Instagram Graph API properly
    // The user profile endpoint requires different permissions
    if (provider === "instagram") {
      // Try to get Instagram user info - Instagram API has limited user info access
      // For Instagram scoped user IDs, we can try fetching from conversations
      try {
        // First try the standard user endpoint
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${userId}?fields=name,username&access_token=${accessToken}`,
          { signal: AbortSignal.timeout(5000) }
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log("[ROUTER] Instagram user data:", JSON.stringify(data));
          
          if (data.username || data.name) {
            return {
              name: data.username ? `@${data.username}` : data.name,
              profilePic: undefined // Instagram API doesn't expose profile_pic for messaging users
            };
          }
        } else {
          const errorText = await response.text();
          console.log(`[ROUTER] Instagram user API returned ${response.status}: ${errorText}`);
        }
      } catch (e) {
        console.log("[ROUTER] Instagram user fetch failed:", e);
      }
      
      // Instagram API has strict limitations on accessing user profiles
      // Return null to use fallback naming
      return null;
    }
    
    // For Facebook Messenger
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${userId}?fields=first_name,last_name,profile_pic&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[ROUTER] Facebook user API returned ${response.status}: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    console.log("[ROUTER] Facebook user data:", JSON.stringify(data));
    
    return {
      name: `${data.first_name || ""} ${data.last_name || ""}`.trim() || "User",
      profilePic: data.profile_pic
    };
  } catch (e) {
    console.error("[ROUTER] Failed to get user info:", e);
    return null;
  }
}
