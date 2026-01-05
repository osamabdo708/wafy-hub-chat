-- Add payment_method column to orders table
ALTER TABLE public.orders 
ADD COLUMN payment_method text DEFAULT 'نقدي';

-- Update existing payment_status values to Arabic
UPDATE public.orders 
SET payment_status = CASE 
  WHEN payment_status = 'paid' THEN 'مدفوع'
  WHEN payment_status = 'pending' THEN 'في انتظار الدفع'
  WHEN payment_status = 'awaiting_payment' THEN 'في انتظار الدفع'
  ELSE 'في انتظار الدفع'
END;

-- Set default for new orders
ALTER TABLE public.orders 
ALTER COLUMN payment_status SET DEFAULT 'في انتظار الدفع';