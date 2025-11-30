-- Add thread_id and platform fields to conversations for proper threading
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS thread_id TEXT,
ADD COLUMN IF NOT EXISTS platform TEXT;

-- Add last_fetch_timestamp to channel_integrations for polling
ALTER TABLE public.channel_integrations
ADD COLUMN IF NOT EXISTS last_fetch_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create unique constraint on (platform, thread_id) to prevent duplicate conversations
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_platform_thread 
ON public.conversations(platform, thread_id) 
WHERE thread_id IS NOT NULL;

-- Create unique constraint on message_id to prevent duplicate messages
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id 
ON public.messages(message_id) 
WHERE message_id IS NOT NULL;

-- Update existing conversations to set thread_id from customer_phone and platform from channel
UPDATE public.conversations 
SET thread_id = customer_phone, 
    platform = channel::text
WHERE thread_id IS NULL AND customer_phone IS NOT NULL;

-- Add index for faster conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_ai_enabled 
ON public.conversations(ai_enabled) 
WHERE ai_enabled = true;

-- Add index for message lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_sent 
ON public.messages(conversation_id, reply_sent, created_at) 
WHERE sender_type = 'customer' AND reply_sent = false;