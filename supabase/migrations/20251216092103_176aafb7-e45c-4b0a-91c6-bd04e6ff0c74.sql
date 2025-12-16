-- Fix multi-tenant conversation uniqueness
-- Current constraint UNIQUE(customer_phone, channel) blocks other workspaces from creating their own conversation
-- for the same sender/channel.

ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS unique_customer_per_channel;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_unique_customer_per_workspace_channel
UNIQUE (workspace_id, channel, customer_phone);
