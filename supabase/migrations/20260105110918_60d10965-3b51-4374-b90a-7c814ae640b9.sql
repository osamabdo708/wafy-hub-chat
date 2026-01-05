-- Create sequence for order numbers if not exists
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- Update the generate_order_number function to use sequence
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_number TEXT;
BEGIN
  new_number := 'ORD-' || LPAD(nextval('order_number_seq')::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

-- Create trigger to auto-set order_number on insert
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS set_order_number_trigger ON public.orders;
CREATE TRIGGER set_order_number_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();

-- Create ai_processing_locks table for preventing duplicate AI messages
CREATE TABLE IF NOT EXISTS public.ai_processing_locks (
  conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds')
);

-- Enable RLS
ALTER TABLE public.ai_processing_locks ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access only
CREATE POLICY "Service role can manage ai_processing_locks"
  ON public.ai_processing_locks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_ai_locks_expires ON public.ai_processing_locks(expires_at);