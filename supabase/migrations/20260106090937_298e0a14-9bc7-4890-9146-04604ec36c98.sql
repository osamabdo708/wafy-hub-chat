-- Remove email column from clients table
ALTER TABLE public.clients DROP COLUMN IF EXISTS email;