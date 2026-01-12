-- Add email column to agents table for login credentials
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- Add column to track if agent is a user agent (can login)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_user_agent BOOLEAN DEFAULT false;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_agents_email ON public.agents(email) WHERE email IS NOT NULL;

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id) WHERE user_id IS NOT NULL;

-- Add RLS policy for agents to see only their assigned conversations
-- First, drop existing policies if any
DROP POLICY IF EXISTS "Agents can view assigned conversations" ON public.conversations;
DROP POLICY IF EXISTS "Workspace owners can view all conversations" ON public.conversations;

-- Policy: Workspace owners can view all conversations in their workspace
CREATE POLICY "Workspace owners can view all conversations"
ON public.conversations
FOR SELECT
USING (
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid()
  )
);

-- Policy: Agents can only view conversations assigned to them
CREATE POLICY "Agents can view assigned conversations"
ON public.conversations
FOR SELECT
USING (
  assigned_agent_id IN (
    SELECT id FROM public.agents WHERE user_id = auth.uid()
  )
);

-- Policy for updating conversations - workspace owners can update all
DROP POLICY IF EXISTS "Workspace owners can update conversations" ON public.conversations;
CREATE POLICY "Workspace owners can update conversations"
ON public.conversations
FOR UPDATE
USING (
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid()
  )
);

-- Policy: Agents can update only assigned conversations (but not change assignment)
DROP POLICY IF EXISTS "Agents can update assigned conversations" ON public.conversations;
CREATE POLICY "Agents can update assigned conversations"
ON public.conversations
FOR UPDATE
USING (
  assigned_agent_id IN (
    SELECT id FROM public.agents WHERE user_id = auth.uid()
  )
);

-- RLS policies for orders
DROP POLICY IF EXISTS "Workspace owners can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Agents can view their created orders" ON public.orders;

-- Policy: Workspace owners can view all orders in their workspace
CREATE POLICY "Workspace owners can view all orders"
ON public.orders
FOR SELECT
USING (
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid()
  )
);

-- Policy: Agents can only view orders they created
CREATE POLICY "Agents can view their created orders"
ON public.orders
FOR SELECT
USING (
  created_by = auth.uid()::text
);

-- Policy: Workspace owners can insert orders
DROP POLICY IF EXISTS "Workspace owners can insert orders" ON public.orders;
CREATE POLICY "Workspace owners can insert orders"
ON public.orders
FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid()
  )
);

-- Policy: Agents can insert orders
DROP POLICY IF EXISTS "Agents can insert orders" ON public.orders;
CREATE POLICY "Agents can insert orders"
ON public.orders
FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT w.id FROM public.workspaces w
    INNER JOIN public.agents a ON a.workspace_id = w.id
    WHERE a.user_id = auth.uid()
  )
);

-- Policy: Workspace owners can update all orders
DROP POLICY IF EXISTS "Workspace owners can update orders" ON public.orders;
CREATE POLICY "Workspace owners can update orders"
ON public.orders
FOR UPDATE
USING (
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid()
  )
);

-- Policy: Agents can update only their created orders
DROP POLICY IF EXISTS "Agents can update their orders" ON public.orders;
CREATE POLICY "Agents can update their orders"
ON public.orders
FOR UPDATE
USING (
  created_by = auth.uid()::text
);

-- Policy: Workspace owners can delete orders
DROP POLICY IF EXISTS "Workspace owners can delete orders" ON public.orders;
CREATE POLICY "Workspace owners can delete orders"
ON public.orders
FOR DELETE
USING (
  workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid()
  )
);

-- Add agent_name column to orders to store the agent's name when order is created
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agent_avatar_url TEXT;