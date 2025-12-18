-- Fix multi-tenant channel connections: allow same channel account_id across multiple workspaces
-- Root cause: legacy channel_integrations had a global UNIQUE(channel, account_id), so the last workspace to connect overwrote/blocked others.

-- 1) Replace global uniqueness with workspace-scoped uniqueness
DROP INDEX IF EXISTS public.channel_integrations_channel_account_idx;

CREATE UNIQUE INDEX IF NOT EXISTS channel_integrations_workspace_channel_account_idx
ON public.channel_integrations (workspace_id, channel, account_id)
WHERE workspace_id IS NOT NULL AND account_id IS NOT NULL;

-- 2) Keep a fast lookup index used by webhook matching
CREATE INDEX IF NOT EXISTS idx_channel_integrations_channel_account
ON public.channel_integrations (channel, account_id);
