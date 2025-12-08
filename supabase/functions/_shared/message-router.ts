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

    // Check for Instagram
    if (entry.messaging) {
      const messaging = entry.messaging[0];
      const pageId = entry.id;
      
      // Determine if Instagram by checking for instagram field or message structure
      const isInstagram = payload.object === "instagram" || 
                          entry.id?.toString().length > 15; // Instagram IDs are typically longer
      
      if (messaging.message) {
        const isEcho = messaging.message.is_echo === true;
        return {
          provider: isInstagram ? "instagram" : "facebook",
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

    // Check for Facebook Messenger
    if (entry.messaging) {
      const messaging = entry.messaging[0];
      if (messaging.message) {
        const isEcho = messaging.message.is_echo === true;
        return {
          provider: "facebook",
          channelId: entry.id,
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
    const fields = provider === "instagram" 
      ? "name,username,profile_picture_url"
      : "first_name,last_name,profile_pic";
    
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${userId}?fields=${fields}&access_token=${accessToken}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (provider === "instagram") {
      return {
        name: data.name || data.username || "Instagram User",
        profilePic: data.profile_picture_url
      };
    }
    
    return {
      name: `${data.first_name || ""} ${data.last_name || ""}`.trim() || "User",
      profilePic: data.profile_pic
    };
  } catch (e) {
    console.error("[ROUTER] Failed to get user info:", e);
    return null;
  }
}
