-- Add account_id column to support multiple accounts per channel
ALTER TABLE public.channel_integrations 
ADD COLUMN IF NOT EXISTS account_id TEXT;

-- Update existing Facebook integrations with their page_id
UPDATE public.channel_integrations 
SET account_id = config->>'page_id' 
WHERE channel = 'facebook' AND config->>'page_id' IS NOT NULL;

-- Update existing Instagram integrations with their instagram_id
UPDATE public.channel_integrations 
SET account_id = config->>'instagram_id' 
WHERE channel = 'instagram' AND config->>'instagram_id' IS NOT NULL;

-- Update existing WhatsApp integrations with their phone_number_id
UPDATE public.channel_integrations 
SET account_id = config->>'phone_number_id' 
WHERE channel = 'whatsapp' AND config->>'phone_number_id' IS NOT NULL;

-- Drop old unique constraint on channel if it exists
ALTER TABLE public.channel_integrations DROP CONSTRAINT IF EXISTS channel_integrations_channel_key;

-- Create new unique constraint on channel + account_id
CREATE UNIQUE INDEX IF NOT EXISTS channel_integrations_channel_account_idx 
ON public.channel_integrations(channel, account_id);