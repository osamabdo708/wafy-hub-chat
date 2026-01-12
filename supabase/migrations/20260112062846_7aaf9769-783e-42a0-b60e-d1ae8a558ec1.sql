-- Create trigger function to link orders to clients and update client info
CREATE OR REPLACE FUNCTION public.link_order_to_client()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from the order
  v_workspace_id := NEW.workspace_id;
  
  -- First, try to get client_id from the conversation
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id
    FROM public.conversations
    WHERE id = NEW.conversation_id;
  END IF;
  
  -- If no client from conversation, try to find by phone
  IF v_client_id IS NULL AND NEW.customer_phone IS NOT NULL AND v_workspace_id IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE workspace_id = v_workspace_id 
      AND phone = NEW.customer_phone
    LIMIT 1;
  END IF;
  
  -- If still no client found, create one
  IF v_client_id IS NULL AND v_workspace_id IS NOT NULL THEN
    INSERT INTO public.clients (workspace_id, name, phone, email)
    VALUES (v_workspace_id, NEW.customer_name, NEW.customer_phone, NEW.customer_email)
    RETURNING id INTO v_client_id;
  ELSIF v_client_id IS NOT NULL THEN
    -- Update the existing client with latest info from order
    UPDATE public.clients
    SET 
      name = COALESCE(NEW.customer_name, name),
      phone = COALESCE(NEW.customer_phone, phone),
      email = COALESCE(NEW.customer_email, email),
      updated_at = now()
    WHERE id = v_client_id;
  END IF;
  
  -- Set the client_id on the order
  NEW.client_id := v_client_id;
  
  -- Also update the conversation's client_id if it's not set
  IF NEW.conversation_id IS NOT NULL AND v_client_id IS NOT NULL THEN
    UPDATE public.conversations
    SET client_id = v_client_id
    WHERE id = NEW.conversation_id AND client_id IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS link_order_to_client_trigger ON public.orders;

-- Create the trigger
CREATE TRIGGER link_order_to_client_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.link_order_to_client();

-- Also create a trigger for order updates to sync client info
CREATE OR REPLACE FUNCTION public.sync_order_client_info()
RETURNS TRIGGER AS $$
BEGIN
  -- Update client info when order is updated
  IF NEW.client_id IS NOT NULL THEN
    UPDATE public.clients
    SET 
      name = COALESCE(NEW.customer_name, name),
      phone = COALESCE(NEW.customer_phone, phone),
      email = COALESCE(NEW.customer_email, email),
      updated_at = now()
    WHERE id = NEW.client_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_order_client_info_trigger ON public.orders;

CREATE TRIGGER sync_order_client_info_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.customer_name IS DISTINCT FROM NEW.customer_name 
     OR OLD.customer_phone IS DISTINCT FROM NEW.customer_phone 
     OR OLD.customer_email IS DISTINCT FROM NEW.customer_email)
  EXECUTE FUNCTION public.sync_order_client_info();

-- Backfill: Link existing orders to clients from their conversations
UPDATE public.orders o
SET client_id = c.client_id
FROM public.conversations c
WHERE o.conversation_id = c.id
  AND o.client_id IS NULL
  AND c.client_id IS NOT NULL;