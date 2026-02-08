
-- Fix the notify_new_order function: use correct net.http_post and hardcode service key lookup
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url text := 'https://pegkzuxbgswqouieordl.supabase.co';
  service_key text;
BEGIN
  -- Get the service role key from Supabase secrets/vault
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF service_key IS NULL OR service_key = '' THEN
    RAISE WARNING 'notify_new_order: SUPABASE_SERVICE_ROLE_KEY not found in vault';
    RETURN NEW;
  END IF;

  -- Call notify-new-activity edge function via pg_net
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify-new-activity',
    body := jsonb_build_object(
      'type', 'new_order',
      'record', jsonb_build_object(
        'id', NEW.id,
        'workspace_id', NEW.workspace_id,
        'order_number', NEW.order_number,
        'customer_name', NEW.customer_name,
        'price', NEW.price
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_order failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
