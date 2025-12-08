-- Drop the restrictive admin-only policy for channel integrations
DROP POLICY IF EXISTS "Only admins can manage integrations " ON public.channel_integrations;

-- Create a new policy that allows all authenticated users to update channel integrations
CREATE POLICY "Authenticated users can update integrations" 
ON public.channel_integrations 
FOR UPDATE 
TO authenticated
USING (true)
WITH CHECK (true);

-- Create a policy for inserting (in case new channels need to be added)
CREATE POLICY "Authenticated users can insert integrations" 
ON public.channel_integrations 
FOR INSERT 
TO authenticated
WITH CHECK (true);