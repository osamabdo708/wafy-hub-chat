-- Allow public read access to orders by order_number for payment status page
CREATE POLICY "Public can view orders by order_number" 
ON public.orders 
FOR SELECT 
USING (true);