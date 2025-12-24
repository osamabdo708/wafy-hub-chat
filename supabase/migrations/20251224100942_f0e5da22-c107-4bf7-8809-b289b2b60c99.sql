-- Make workspace name unique for store URLs
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_name_unique UNIQUE (name);

-- Add store settings to workspaces
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS store_slug text,
ADD COLUMN IF NOT EXISTS store_logo_url text,
ADD COLUMN IF NOT EXISTS store_banner_url text,
ADD COLUMN IF NOT EXISTS store_description text,
ADD COLUMN IF NOT EXISTS store_phone text,
ADD COLUMN IF NOT EXISTS store_email text,
ADD COLUMN IF NOT EXISTS store_address text,
ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS store_enabled boolean DEFAULT false;

-- Create unique constraint on store_slug
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_store_slug_unique UNIQUE (store_slug);

-- Create categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for categories
CREATE POLICY "Users can view their workspace categories"
ON public.categories FOR SELECT
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create categories in their workspace"
ON public.categories FOR INSERT
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace categories"
ON public.categories FOR UPDATE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace categories"
ON public.categories FOR DELETE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Public read access for categories (for store page)
CREATE POLICY "Public can view active categories"
ON public.categories FOR SELECT
USING (is_active = true);

-- Add category_id to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- Create shipping_methods table
CREATE TABLE public.shipping_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  provider TEXT, -- 'manual', 'eps', etc.
  price NUMERIC NOT NULL DEFAULT 0,
  estimated_days INTEGER,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on shipping_methods
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;

-- RLS policies for shipping_methods
CREATE POLICY "Users can view their workspace shipping methods"
ON public.shipping_methods FOR SELECT
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create shipping methods in their workspace"
ON public.shipping_methods FOR INSERT
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace shipping methods"
ON public.shipping_methods FOR UPDATE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace shipping methods"
ON public.shipping_methods FOR DELETE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Public read access for shipping methods (for store checkout)
CREATE POLICY "Public can view active shipping methods"
ON public.shipping_methods FOR SELECT
USING (is_active = true);

-- Create payment_settings table
CREATE TABLE public.payment_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
  cod_enabled BOOLEAN DEFAULT true,
  paytabs_enabled BOOLEAN DEFAULT false,
  paytabs_profile_id TEXT,
  paytabs_server_key_encrypted TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on payment_settings
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_settings
CREATE POLICY "Users can view their workspace payment settings"
ON public.payment_settings FOR SELECT
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create payment settings in their workspace"
ON public.payment_settings FOR INSERT
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace payment settings"
ON public.payment_settings FOR UPDATE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Add payment link fields to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_link TEXT,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS shipping_method_id UUID REFERENCES public.shipping_methods(id),
ADD COLUMN IF NOT EXISTS shipping_address TEXT;

-- Create trigger for updated_at on new tables
CREATE TRIGGER update_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shipping_methods_updated_at
BEFORE UPDATE ON public.shipping_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_settings_updated_at
BEFORE UPDATE ON public.payment_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public read access for active products (for store page)
CREATE POLICY "Public can view active products"
ON public.products FOR SELECT
USING (is_active = true);