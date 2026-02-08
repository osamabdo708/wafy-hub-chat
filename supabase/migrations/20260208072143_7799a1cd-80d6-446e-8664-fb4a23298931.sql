
-- Fix: notify-new-activity has verify_jwt=false, so no auth needed
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://pegkzuxbgswqouieordl.supabase.co/functions/v1/notify-new-activity',
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
      'Content-Type', 'application/json'
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_order failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
