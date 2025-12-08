-- =====================================================
-- ENTERPRISE CHANNEL INTEGRATION SYSTEM
-- Multi-tenant, data-driven, production-ready
-- =====================================================

-- 1. Workspaces table (multi-tenancy foundation)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_user_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Channel configurations (data-driven)
CREATE TABLE IF NOT EXISTS public.channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  auth_url TEXT,
  token_url TEXT,
  refresh_url TEXT,
  scopes JSONB DEFAULT '{}',
  webhook_register_url TEXT,
  supports_webhook BOOLEAN DEFAULT true,
  supports_polling BOOLEAN DEFAULT false,
  supports_refresh BOOLEAN DEFAULT false,
  config_schema JSONB DEFAULT '{}',
  icon_name TEXT,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Channel connections (replaces channel_integrations for new system)
CREATE TABLE IF NOT EXISTS public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_channel_id VARCHAR(255),
  provider_entity_name VARCHAR(255),
  display_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'connected',
  scopes TEXT[],
  webhook_subscribed BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (workspace_id, provider, provider_channel_id)
);

-- 4. OAuth tokens (encrypted storage)
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  token_type VARCHAR(50) DEFAULT 'bearer',
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Webhook events (deduplication and retry)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  event_id VARCHAR(255),
  provider_channel_id VARCHAR(255),
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(provider, event_id)
);

-- 6. Audit logs for security tracking
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id),
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 7. Add workspace_id to existing tables (nullable for migration)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

ALTER TABLE public.services 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_channel_connections_provider_channel 
ON public.channel_connections(provider, provider_channel_id);

CREATE INDEX IF NOT EXISTS idx_channel_connections_workspace 
ON public.channel_connections(workspace_id);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_connection 
ON public.oauth_tokens(connection_id);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires 
ON public.oauth_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed 
ON public.webhook_events(processed, received_at) WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_channel 
ON public.webhook_events(provider, provider_channel_id);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace 
ON public.conversations(workspace_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace 
ON public.audit_logs(workspace_id, created_at);

-- 9. Enable RLS on new tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 10. RLS Policies for workspaces
CREATE POLICY "Users can view their own workspaces"
ON public.workspaces FOR SELECT
USING (owner_user_id = auth.uid());

CREATE POLICY "Users can create workspaces"
ON public.workspaces FOR INSERT
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can update their own workspaces"
ON public.workspaces FOR UPDATE
USING (owner_user_id = auth.uid());

-- 11. RLS Policies for channel_configs (read-only for all authenticated)
CREATE POLICY "Anyone can view channel configs"
ON public.channel_configs FOR SELECT
USING (true);

-- 12. RLS Policies for channel_connections
CREATE POLICY "Users can view their workspace connections"
ON public.channel_connections FOR SELECT
USING (
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid())
);

CREATE POLICY "Users can create connections for their workspaces"
ON public.channel_connections FOR INSERT
WITH CHECK (
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid())
);

CREATE POLICY "Users can update their workspace connections"
ON public.channel_connections FOR UPDATE
USING (
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid())
);

CREATE POLICY "Users can delete their workspace connections"
ON public.channel_connections FOR DELETE
USING (
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid())
);

-- 13. RLS Policies for oauth_tokens (restricted access)
CREATE POLICY "Users can view tokens for their connections"
ON public.oauth_tokens FOR SELECT
USING (
  connection_id IN (
    SELECT cc.id FROM public.channel_connections cc
    JOIN public.workspaces w ON cc.workspace_id = w.id
    WHERE w.owner_user_id = auth.uid()
  )
);

-- 14. RLS Policies for webhook_events (service role only for writes)
CREATE POLICY "Authenticated can view webhook events"
ON public.webhook_events FOR SELECT
USING (true);

-- 15. RLS Policies for audit_logs
CREATE POLICY "Users can view their workspace audit logs"
ON public.audit_logs FOR SELECT
USING (
  workspace_id IN (SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid())
);

-- 16. Insert default channel configurations
INSERT INTO public.channel_configs (provider, display_name, auth_url, token_url, refresh_url, scopes, webhook_register_url, supports_webhook, supports_refresh, icon_name, color)
VALUES 
  ('facebook', 'Facebook Messenger', 'https://www.facebook.com/v19.0/dialog/oauth', 'https://graph.facebook.com/v19.0/oauth/access_token', 'https://graph.facebook.com/v19.0/oauth/access_token', '{"default": ["pages_show_list", "pages_messaging", "pages_read_engagement", "pages_manage_metadata"]}', 'https://graph.facebook.com/v19.0/{page_id}/subscribed_apps', true, true, 'facebook', '#1877F2'),
  ('instagram', 'Instagram', 'https://www.facebook.com/v19.0/dialog/oauth', 'https://graph.facebook.com/v19.0/oauth/access_token', 'https://graph.facebook.com/v19.0/oauth/access_token', '{"default": ["instagram_basic", "instagram_manage_messages", "pages_show_list", "pages_messaging", "pages_read_engagement", "pages_manage_metadata"]}', 'https://graph.facebook.com/v19.0/{page_id}/subscribed_apps', true, true, 'instagram', '#E4405F'),
  ('whatsapp', 'WhatsApp Business', 'https://www.facebook.com/v19.0/dialog/oauth', 'https://graph.facebook.com/v19.0/oauth/access_token', 'https://graph.facebook.com/v19.0/oauth/access_token', '{"default": ["whatsapp_business_management", "whatsapp_business_messaging", "pages_show_list"]}', null, true, true, 'whatsapp', '#25D366'),
  ('telegram', 'Telegram', null, null, null, '{}', 'https://api.telegram.org/bot{token}/setWebhook', true, false, 'telegram', '#0088CC'),
  ('tiktok', 'TikTok', null, null, null, '{}', null, false, false, 'tiktok', '#000000')
ON CONFLICT (provider) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  auth_url = EXCLUDED.auth_url,
  token_url = EXCLUDED.token_url,
  scopes = EXCLUDED.scopes;

-- 17. Create default workspace for existing users (migration helper)
CREATE OR REPLACE FUNCTION public.create_default_workspace()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES ('My Workspace', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 18. Trigger to auto-create workspace for new users
DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_workspace();

-- 19. Create workspaces for existing users
INSERT INTO public.workspaces (name, owner_user_id)
SELECT 'My Workspace', id FROM auth.users
ON CONFLICT DO NOTHING;

-- 20. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;