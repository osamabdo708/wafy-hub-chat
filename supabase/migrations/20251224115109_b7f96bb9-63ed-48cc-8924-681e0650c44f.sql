-- Create app_settings table for dynamic configuration
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key varchar(255) NOT NULL UNIQUE,
  value text,
  description text,
  category varchar(100) DEFAULT 'general',
  is_sensitive boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage app settings
CREATE POLICY "Super admins can view app settings" 
ON public.app_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert app settings" 
ON public.app_settings 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update app settings" 
ON public.app_settings 
FOR UPDATE 
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete app settings" 
ON public.app_settings 
FOR DELETE 
USING (has_role(auth.uid(), 'super_admin'));

-- Insert default Meta App settings
INSERT INTO public.app_settings (key, value, description, category, is_sensitive) VALUES
  ('META_APP_ID', '', 'Meta/Facebook App ID', 'meta', false),
  ('META_APP_SECRET', '', 'Meta/Facebook App Secret', 'meta', true),
  ('META_WEBHOOK_VERIFY_TOKEN', '', 'Webhook Verification Token', 'meta', true),
  ('META_WEBHOOK_URL', '', 'Webhook Callback URL', 'meta', false),
  ('META_GRAPH_API_VERSION', 'v18.0', 'Meta Graph API Version', 'meta', false),
  ('OPENAI_API_KEY', '', 'OpenAI API Key for AI features', 'ai', true),
  ('PAYTABS_PROFILE_ID', '', 'PayTabs Profile ID', 'payments', false),
  ('PAYTABS_SERVER_KEY', '', 'PayTabs Server Key', 'payments', true),
  ('EPS_API_KEY', '', 'EPS Shipping API Key', 'shipping', true),
  ('EPS_API_URL', '', 'EPS Shipping API URL', 'shipping', false);

-- Create trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();