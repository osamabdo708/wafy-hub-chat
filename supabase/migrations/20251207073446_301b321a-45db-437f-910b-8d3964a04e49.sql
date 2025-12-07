-- Allow authenticated users to delete conversations
CREATE POLICY "Users can delete conversations" 
ON public.conversations 
FOR DELETE 
TO authenticated
USING (true);

-- Allow authenticated users to delete messages  
CREATE POLICY "Users can delete messages" 
ON public.messages 
FOR DELETE 
TO authenticated
USING (true);