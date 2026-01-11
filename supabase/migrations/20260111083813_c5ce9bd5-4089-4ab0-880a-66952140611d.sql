-- Add unique constraint on workspace_id and channel for channel_integrations
ALTER TABLE public.channel_integrations 
ADD CONSTRAINT channel_integrations_workspace_channel_unique 
UNIQUE (workspace_id, channel);