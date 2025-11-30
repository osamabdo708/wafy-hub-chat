# System Architecture - Polling-Only Design

## Overview
This system uses **100% polling architecture** with **ZERO webhooks**. All message imports happen automatically via scheduled background jobs.

---

## Core Components

### 1. Auto-Import System (Polling)
**Function**: `auto-import-messages`  
**Schedule**: Every 10 seconds (via Supabase cron)  
**Purpose**: Automatically fetch new messages from all connected platforms

#### Supported Platforms:
- ✅ Facebook Messenger
- ✅ Instagram DM
- ⚠️ WhatsApp (API limitation - no historical fetch)

#### How It Works:
1. Runs every 10 seconds automatically
2. Fetches messages since `last_fetch_timestamp` for each platform
3. Handles pagination for bulk imports
4. Deduplicates using `message_id` (unique constraint)
5. Maps messages to conversations using `thread_id`
6. Marks messages as `is_old=true` on first import (history)
7. Marks messages as `is_old=false` on subsequent imports (new)
8. Updates `last_fetch_timestamp` after each successful import
9. Triggers `auto-reply-messages` only for new messages

#### Message Fields:
```typescript
{
  conversation_id: string,    // Links to conversation
  content: string,            // Message text
  sender_type: 'customer' | 'employee' | 'agent',
  message_id: string,         // Platform's unique ID (deduplication)
  is_old: boolean,            // true = history, false = new
  reply_sent: boolean,        // true = AI already replied
  created_at: timestamp       // When message was sent
}
```

---

### 2. AI Auto-Reply System
**Function**: `auto-reply-messages`  
**Trigger**: Called by auto-import when new messages arrive  
**Purpose**: Automatically reply to customer messages when AI is enabled

#### Reply Conditions (ALL must be true):
```typescript
ai_enabled = true         // Conversation toggle must be ON
is_old = false           // Must be a NEW message (not history)
reply_sent = false       // AI hasn't replied yet
sender_type = 'customer' // Only reply to customer messages
```

#### AI Behavior:
1. Fetches last **10 messages** for context
2. Reads all **active products** from catalog
3. Acts as professional sales agent
4. Naturally extracts customer needs from conversation
5. Suggests products from catalog
6. **Auto-creates orders** via tool calling when customer confirms purchase
7. Marks messages as `reply_sent=true` after sending

#### AI Tool: `create_order`
When customer confirms purchase intent, AI can automatically:
- Extract product name from conversation
- Detect quantity
- Pre-fill customer data from conversation history
- Create order in `orders` table with `ai_generated=true`

---

### 3. Conversation Threading
**Key**: `thread_id` + `platform`  
**Purpose**: Ensure messages append to correct conversation

#### Thread ID Format:
- Facebook: `<conversation_id>` from Graph API
- Instagram: `<conversation_id>` from Graph API  
- WhatsApp: `whatsapp_<phone_number>`

#### Rules:
- ✅ Employee messages use existing `thread_id` (NO new conversation created)
- ✅ All messages from same thread go to same conversation
- ✅ New threads create new conversations

---

### 4. Message Deduplication
**Method**: Unique constraint on `message_id`  
**Purpose**: Prevent duplicate messages during polling

#### Implementation:
```sql
-- Unique index prevents duplicates
CREATE UNIQUE INDEX idx_messages_message_id ON messages(message_id);
```

Before inserting, system checks:
```typescript
const { data: existingMsg } = await supabase
  .from('messages')
  .select('id')
  .eq('message_id', msg.id)
  .maybeSingle();

if (existingMsg) {
  console.log('Skipping duplicate');
  continue;
}
```

---

## Data Flow

### Initial Import (First Time)
```
┌─────────────────────────────────────────────┐
│ auto-import-messages (runs every 10 sec)   │
└──────────────┬──────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Fetch all messages   │
    │ from platforms       │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Mark as is_old=true  │
    │ reply_sent=true      │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Save to database     │
    │ (AI will NOT reply)  │
    └──────────────────────┘
```

### Ongoing Polling (Every 10 Seconds)
```
┌─────────────────────────────────────────────┐
│ auto-import-messages (scheduled)            │
└──────────────┬──────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Fetch new messages   │
    │ since last_fetch     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Check message_id     │
    │ (skip duplicates)    │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Mark as is_old=false │
    │ reply_sent=false     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Save to database     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Trigger auto-reply   │
    │ (if ai_enabled=true) │
    └──────────────────────┘
```

### AI Reply Flow
```
┌─────────────────────────────────────────────┐
│ auto-reply-messages                         │
└──────────────┬──────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Find conversations   │
    │ with ai_enabled=true │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Check for unreplied  │
    │ customer messages    │
    │ (is_old=false AND    │
    │  reply_sent=false)   │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Get last 10 messages │
    │ + products catalog   │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Call OpenAI with     │
    │ tool calling         │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ If create_order tool │
    │ called: create order │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Send AI reply        │
    │ via platform API     │
    └──────────┬───────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Mark reply_sent=true │
    └──────────────────────┘
```

---

## Database Schema

### Conversations Table
```typescript
{
  id: uuid,
  customer_name: string,
  customer_phone: string,
  thread_id: string,           // Unique per platform
  platform: 'facebook' | 'instagram' | 'whatsapp',
  channel: 'facebook' | 'instagram' | 'whatsapp',
  ai_enabled: boolean,         // Toggle for AI replies
  status: 'جديد' | 'مفتوح' | 'مغلق' | 'معلق',
  last_message_at: timestamp
}
```

### Messages Table
```typescript
{
  id: uuid,
  conversation_id: uuid,
  content: string,
  sender_type: 'customer' | 'employee' | 'agent',
  message_id: string,          // UNIQUE - prevents duplicates
  is_old: boolean,             // false = AI can reply
  reply_sent: boolean,         // true = AI already replied
  created_at: timestamp
}
```

### Channel Integrations Table
```typescript
{
  id: uuid,
  channel: 'facebook' | 'instagram' | 'whatsapp',
  is_connected: boolean,
  config: jsonb,               // API credentials
  last_fetch_timestamp: timestamp  // For incremental polling
}
```

---

## Key Features

### ✅ No Webhooks
- Zero webhook routes
- Zero webhook handlers
- Zero webhook verification
- 100% polling-based

### ✅ Automatic Import
- No manual "Import" button needed
- Runs every 10 seconds automatically
- Handles pagination for bulk imports
- Prevents duplicates via unique constraint

### ✅ Smart AI Toggle
- Per-conversation `ai_enabled` control
- AI only replies to:
  - NEW messages (is_old=false)
  - UNREPLIED messages (reply_sent=false)
  - CUSTOMER messages (sender_type='customer')

### ✅ Conversation Context
- AI reads last 10 messages
- Understands conversation flow
- No repetitive questions
- Natural human-like responses

### ✅ Auto Order Creation
- AI detects purchase intent
- Extracts product + quantity from conversation
- Pre-fills customer data
- Creates order automatically

### ✅ Employee Messages
- Append to existing conversation
- DO NOT create new conversation
- Use existing `thread_id`

---

## Platform Limitations

### Facebook Messenger ✅
- ✅ Can fetch historical messages
- ✅ Supports pagination
- ✅ Full message content

### Instagram DM ✅
- ✅ Can fetch historical messages
- ✅ Supports pagination
- ✅ Full message content

### WhatsApp Cloud API ⚠️
- ❌ Cannot fetch historical messages via API
- ⚠️ Only real-time delivery (not available in polling)
- ⚠️ Requires webhook for new messages
- 💡 Alternative: Manual database population

---

## Cron Job Configuration

Located in Supabase SQL:
```sql
SELECT cron.schedule(
  'auto-import-messages-every-10-seconds',
  '*/10 * * * * *',
  $$
  SELECT net.http_post(
      url:='https://[project-ref].supabase.co/functions/v1/auto-import-messages',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer [anon-key]"}'::jsonb,
      body:='{}'::jsonb
  ) as request_id;
  $$
);
```

---

## Debugging

### Check Import Logs
```sql
-- View recent edge function logs
SELECT * FROM edge_function_logs 
WHERE function_name = 'auto-import-messages'
ORDER BY timestamp DESC 
LIMIT 20;
```

### Check Cron Status
```sql
-- Check if cron job is running
SELECT * FROM cron.job 
WHERE command LIKE '%auto-import%';
```

### Check Last Import Timestamp
```sql
-- See when last import happened
SELECT channel, last_fetch_timestamp 
FROM channel_integrations;
```

### Check Unreplied Messages
```sql
-- Find messages awaiting AI reply
SELECT * FROM messages 
WHERE is_old = false 
  AND reply_sent = false 
  AND sender_type = 'customer';
```

---

## Security Notes

1. **Service Role Key**: Auto-import uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS
2. **API Keys**: Stored securely in `channel_integrations.config` (jsonb)
3. **Rate Limits**: 10-second polling prevents API rate limit issues
4. **Deduplication**: Unique constraint prevents message spam

---

## Maintenance

### To Add New Platform:
1. Add integration in `channel_integrations` table
2. Update `auto-import-messages` function with new platform logic
3. Ensure `thread_id` format is documented
4. Add platform-specific sending logic in `send-{platform}-message`

### To Change Polling Interval:
```sql
-- Update cron schedule (default: */10 * * * * *)
-- Example: Every 5 seconds: */5 * * * * *
-- Example: Every 30 seconds: */30 * * * * *
UPDATE cron.job 
SET schedule = '*/30 * * * * *' 
WHERE command LIKE '%auto-import%';
```

---

## Summary

This architecture is:
- ✅ **Simple**: No webhook complexity
- ✅ **Reliable**: Polling never misses messages
- ✅ **Scalable**: Handles pagination automatically
- ✅ **Smart**: AI only replies when needed
- ✅ **Safe**: Deduplication prevents duplicates
- ✅ **Automated**: Zero manual intervention required
