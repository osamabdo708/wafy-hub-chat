-- Create agents table
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  is_ai BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- RLS policies for agents
CREATE POLICY "Users can view agents in their workspace"
ON public.agents FOR SELECT
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create agents in their workspace"
ON public.agents FOR INSERT
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update agents in their workspace"
ON public.agents FOR UPDATE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()) AND is_system = false);

CREATE POLICY "Users can delete non-system agents"
ON public.agents FOR DELETE
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()) AND is_system = false);

-- Super admin can see all agents
CREATE POLICY "Super admin can view all agents"
ON public.agents FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Add assigned_agent_id to conversations
ALTER TABLE public.conversations 
ADD COLUMN assigned_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;

-- Create function to auto-create default AI agent for new workspaces
CREATE OR REPLACE FUNCTION public.create_default_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agents (workspace_id, name, is_ai, is_system)
  VALUES (NEW.id, 'المارد', true, true);
  RETURN NEW;
END;
$$;

-- Trigger to create default agent when workspace is created
CREATE TRIGGER on_workspace_created_add_agent
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.create_default_agent();

-- Add super_admin to app_role enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'super_admin' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'super_admin';
  END IF;
END$$;

-- Update updated_at trigger for agents
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();