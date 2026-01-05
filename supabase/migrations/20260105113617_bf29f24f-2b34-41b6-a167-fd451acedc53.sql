-- Sync order_number sequence with existing ORD-0001..ORD-9999 style values
DO $$
DECLARE
  max_num bigint;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(order_number, '^ORD-(\d{4})$'))[1]::bigint),
    0
  )
  INTO max_num
  FROM public.orders
  WHERE order_number ~ '^ORD-\d{4}$';

  -- setval(value, is_called=true) => nextval returns value+1
  PERFORM setval('public.order_number_seq', max_num, true);
END $$;
