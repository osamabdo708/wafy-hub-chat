-- Add password_hash column to agents table for custom agent authentication
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add session_token for agent sessions
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS session_token TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index on session_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_agents_session_token ON public.agents(session_token) WHERE session_token IS NOT NULL;

-- Remove the user_id column requirement since we're not using auth.users for agents
-- Keep the column but it will be null for user agents