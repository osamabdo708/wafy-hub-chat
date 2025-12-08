
-- Add workspace_id to channel_integrations
ALTER TABLE public.channel_integrations 
ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Only admins can manage integrations" ON public.channel_integrations;
DROP POLICY IF EXISTS "Authenticated users can view integrations" ON public.channel_integrations;
DROP POLICY IF EXISTS "Authenticated users can update integrations" ON public.channel_integrations;
DROP POLICY IF EXISTS "Authenticated users can insert integrations" ON public.channel_integrations;

-- Create workspace-scoped policies for channel_integrations
CREATE POLICY "Users can view their workspace integrations" 
ON public.channel_integrations FOR SELECT 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create integrations in their workspace" 
ON public.channel_integrations FOR INSERT 
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace integrations" 
ON public.channel_integrations FOR UPDATE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace integrations" 
ON public.channel_integrations FOR DELETE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Also scope channel_connections to workspace
DROP POLICY IF EXISTS "Users can view their workspace connections" ON public.channel_connections;
DROP POLICY IF EXISTS "Users can create connections for their workspaces" ON public.channel_connections;
DROP POLICY IF EXISTS "Users can update their workspace connections" ON public.channel_connections;
DROP POLICY IF EXISTS "Users can delete their workspace connections" ON public.channel_connections;

CREATE POLICY "Users can view their workspace connections" 
ON public.channel_connections FOR SELECT 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create connections for their workspaces" 
ON public.channel_connections FOR INSERT 
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace connections" 
ON public.channel_connections FOR UPDATE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace connections" 
ON public.channel_connections FOR DELETE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));
