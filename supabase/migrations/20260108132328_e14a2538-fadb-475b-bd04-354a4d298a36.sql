-- Fix the link_order_to_client function to not use email column
CREATE OR REPLACE FUNCTION public.link_order_to_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
      -- Create new client (without email since column doesn't exist)
      INSERT INTO public.clients (workspace_id, name, phone)
      VALUES (NEW.workspace_id, NEW.customer_name, NEW.customer_phone)
      RETURNING id INTO NEW.client_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;