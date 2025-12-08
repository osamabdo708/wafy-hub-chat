
-- Drop existing permissive policies on conversations
DROP POLICY IF EXISTS "Users can view all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete conversations" ON public.conversations;

-- Create workspace-scoped policies for conversations
CREATE POLICY "Users can view their workspace conversations" 
ON public.conversations FOR SELECT 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create conversations in their workspace" 
ON public.conversations FOR INSERT 
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace conversations" 
ON public.conversations FOR UPDATE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace conversations" 
ON public.conversations FOR DELETE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Drop existing permissive policies on messages
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can create messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages" ON public.messages;

-- Create workspace-scoped policies for messages (via conversation)
CREATE POLICY "Users can view their workspace messages" 
ON public.messages FOR SELECT 
USING (conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN workspaces w ON c.workspace_id = w.id 
  WHERE w.owner_user_id = auth.uid()
));

CREATE POLICY "Users can create messages in their workspace" 
ON public.messages FOR INSERT 
WITH CHECK (conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN workspaces w ON c.workspace_id = w.id 
  WHERE w.owner_user_id = auth.uid()
));

CREATE POLICY "Users can update their workspace messages" 
ON public.messages FOR UPDATE 
USING (conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN workspaces w ON c.workspace_id = w.id 
  WHERE w.owner_user_id = auth.uid()
));

CREATE POLICY "Users can delete their workspace messages" 
ON public.messages FOR DELETE 
USING (conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN workspaces w ON c.workspace_id = w.id 
  WHERE w.owner_user_id = auth.uid()
));

-- Drop existing permissive policies on products
DROP POLICY IF EXISTS "Users can view products" ON public.products;
DROP POLICY IF EXISTS "Users can manage products" ON public.products;

-- Create workspace-scoped policies for products
CREATE POLICY "Users can view their workspace products" 
ON public.products FOR SELECT 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create products in their workspace" 
ON public.products FOR INSERT 
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace products" 
ON public.products FOR UPDATE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace products" 
ON public.products FOR DELETE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Drop existing permissive policies on services
DROP POLICY IF EXISTS "Users can view services" ON public.services;
DROP POLICY IF EXISTS "Users can manage services" ON public.services;

-- Create workspace-scoped policies for services
CREATE POLICY "Users can view their workspace services" 
ON public.services FOR SELECT 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create services in their workspace" 
ON public.services FOR INSERT 
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace services" 
ON public.services FOR UPDATE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace services" 
ON public.services FOR DELETE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

-- Drop existing permissive policies on orders
DROP POLICY IF EXISTS "Users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;

-- Create workspace-scoped policies for orders
CREATE POLICY "Users can view their workspace orders" 
ON public.orders FOR SELECT 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can create orders in their workspace" 
ON public.orders FOR INSERT 
WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can update their workspace orders" 
ON public.orders FOR UPDATE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can delete their workspace orders" 
ON public.orders FOR DELETE 
USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_user_id = auth.uid()));
