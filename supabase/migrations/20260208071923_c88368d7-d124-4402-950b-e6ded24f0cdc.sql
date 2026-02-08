
-- Fix link_order_to_client: handle duplicate client phone gracefully
CREATE OR REPLACE FUNCTION public.link_order_to_client()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id uuid;
  v_workspace_id uuid;
BEGIN
  v_workspace_id := NEW.workspace_id;
  
  -- First, try to get client_id from the conversation
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT client_id INTO v_client_id
    FROM public.conversations
    WHERE id = NEW.conversation_id;
  END IF;
  
  -- If no client from conversation, try to find by phone
  IF v_client_id IS NULL AND NEW.customer_phone IS NOT NULL AND NEW.customer_phone != '' AND v_workspace_id IS NOT NULL THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE workspace_id = v_workspace_id 
      AND phone = NEW.customer_phone
    LIMIT 1;
  END IF;
  
  -- If still no client found, try to create one (with conflict handling)
  IF v_client_id IS NULL AND v_workspace_id IS NOT NULL THEN
    INSERT INTO public.clients (workspace_id, name, phone, email)
    VALUES (v_workspace_id, NEW.customer_name, NEW.customer_phone, NEW.customer_email)
    ON CONFLICT (workspace_id, phone) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, clients.name),
      email = COALESCE(EXCLUDED.email, clients.email),
      updated_at = now()
    RETURNING id INTO v_client_id;
  ELSIF v_client_id IS NOT NULL THEN
    UPDATE public.clients
    SET 
      name = COALESCE(NEW.customer_name, name),
      phone = COALESCE(NEW.customer_phone, phone),
      email = COALESCE(NEW.customer_email, email),
      updated_at = now()
    WHERE id = v_client_id;
  END IF;
  
  NEW.client_id := v_client_id;
  
  IF NEW.conversation_id IS NOT NULL AND v_client_id IS NOT NULL THEN
    UPDATE public.conversations
    SET client_id = v_client_id
    WHERE id = NEW.conversation_id AND client_id IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
