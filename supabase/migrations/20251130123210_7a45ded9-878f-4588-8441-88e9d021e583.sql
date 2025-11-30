-- Add new columns to messages table for deduplication and tracking
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS message_id TEXT,
ADD COLUMN IF NOT EXISTS is_old BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reply_sent BOOLEAN DEFAULT false;

-- Create unique index on message_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS unique_message_id ON public.messages(message_id) WHERE message_id IS NOT NULL;

-- Add new columns to orders table for tracking
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS source_platform TEXT,
ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'employee';

-- Update orders conversation_id to be nullable (already is, but making explicit)
-- This ensures we can track which conversation led to an order