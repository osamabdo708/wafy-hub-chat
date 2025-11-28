-- Add ai_enabled field to conversations table
ALTER TABLE public.conversations 
ADD COLUMN ai_enabled boolean DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.conversations.ai_enabled IS 'Enable AI assistant to handle this conversation automatically';