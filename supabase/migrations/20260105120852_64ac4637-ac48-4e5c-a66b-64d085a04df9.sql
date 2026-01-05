-- Add separate field to store customer's real phone number without overwriting channel recipient ID
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS customer_contact_phone text;

COMMENT ON COLUMN public.conversations.customer_phone IS 'Channel recipient identifier (e.g. Facebook PSID, Instagram Scoped User ID, WhatsApp wa_id/phone). Do NOT overwrite with real phone.';
COMMENT ON COLUMN public.conversations.customer_contact_phone IS 'Customer real phone number provided during checkout flow (may differ from channel recipient id).';