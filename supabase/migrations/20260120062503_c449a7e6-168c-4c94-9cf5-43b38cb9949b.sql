-- Create shopify_settings table to store Shopify integration configuration
CREATE TABLE public.shopify_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  store_url text,
  access_token_encrypted text,
  api_key text,
  api_secret_encrypted text,
  webhook_secret text,
  shop_name text,
  shop_domain text,
  shop_email text,
  shop_currency text,
  is_connected boolean DEFAULT false,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shopify_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their workspace shopify settings"
ON public.shopify_settings
FOR SELECT
USING (workspace_id IN (
  SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
));

CREATE POLICY "Users can create shopify settings for their workspace"
ON public.shopify_settings
FOR INSERT
WITH CHECK (workspace_id IN (
  SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
));

CREATE POLICY "Users can update their workspace shopify settings"
ON public.shopify_settings
FOR UPDATE
USING (workspace_id IN (
  SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
));

CREATE POLICY "Users can delete their workspace shopify settings"
ON public.shopify_settings
FOR DELETE
USING (workspace_id IN (
  SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_shopify_settings_updated_at
BEFORE UPDATE ON public.shopify_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();