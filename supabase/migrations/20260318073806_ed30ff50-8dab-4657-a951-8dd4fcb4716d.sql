
-- Create storage bucket for client avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('client-avatars', 'client-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public can view client avatars" ON storage.objects FOR SELECT TO public USING (bucket_id = 'client-avatars');

-- Allow service role to upload
CREATE POLICY "Service role can upload client avatars" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'client-avatars');

-- Allow service role to update
CREATE POLICY "Service role can update client avatars" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'client-avatars');
