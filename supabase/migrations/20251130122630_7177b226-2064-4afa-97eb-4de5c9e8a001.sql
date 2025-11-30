-- First, delete duplicate conversations, keeping only the most recent one
DELETE FROM public.conversations
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY customer_phone, channel ORDER BY last_message_at DESC, created_at DESC) as rn
    FROM public.conversations
  ) t
  WHERE t.rn > 1
);

-- Now add unique constraint to prevent future duplicates
ALTER TABLE public.conversations 
ADD CONSTRAINT unique_customer_per_channel 
UNIQUE (customer_phone, channel);