-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, phone)
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their workspace clients"
ON public.clients FOR SELECT
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create clients in their workspace"
ON public.clients FOR INSERT
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace clients"
ON public.clients FOR UPDATE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace clients"
ON public.clients FOR DELETE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Add client_id to orders table
ALTER TABLE public.orders ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Create function to auto-create/link client when order is created
CREATE OR REPLACE FUNCTION public.link_order_to_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_client_id UUID;
BEGIN
  -- Only process if we have customer info
  IF NEW.customer_phone IS NOT NULL AND NEW.customer_phone != '' THEN
    -- Try to find existing client by phone in same workspace
    SELECT id INTO existing_client_id
    FROM public.clients
    WHERE workspace_id = NEW.workspace_id
      AND phone = NEW.customer_phone
    LIMIT 1;

    IF existing_client_id IS NOT NULL THEN
      -- Link to existing client
      NEW.client_id := existing_client_id;
    ELSE
      -- Create new client
      INSERT INTO public.clients (workspace_id, name, phone, email)
      VALUES (NEW.workspace_id, NEW.customer_name, NEW.customer_phone, NEW.customer_email)
      RETURNING id INTO NEW.client_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER link_order_to_client_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.link_order_to_client();

-- Update trigger for updated_at on clients
CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();