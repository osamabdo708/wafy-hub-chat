-- Drop the restrictive view policy and add a permissive one for authenticated users
DROP POLICY IF EXISTS "Only admins can view integrations" ON public.channel_integrations;

-- Allow all authenticated users to view channel integrations (needed for inbox to work)
CREATE POLICY "Authenticated users can view integrations" 
ON public.channel_integrations 
FOR SELECT 
TO authenticated
USING (true);

-- Keep the admin-only policy for managing (INSERT, UPDATE, DELETE)
-- The existing "Only admins can manage integrations" policy handles this