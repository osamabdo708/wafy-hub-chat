
-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create trigger function to notify on new order
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  -- Get the Supabase URL and service role key from vault or config
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, try env-based approach
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := 'https://pegkzuxbgswqouieordl.supabase.co';
  END IF;

  -- Call notify-new-activity edge function via pg_net
  PERFORM extensions.http_post(
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
  -- Don't block order creation if notification fails
  RAISE WARNING 'notify_new_order failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS trigger_notify_new_order ON public.orders;
CREATE TRIGGER trigger_notify_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_order();
