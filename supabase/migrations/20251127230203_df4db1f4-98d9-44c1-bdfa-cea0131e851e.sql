-- Add customer_avatar field to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS customer_avatar text;