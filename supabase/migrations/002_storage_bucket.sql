-- Storage bucket setup for LocalTune
-- Creates the private 'music' bucket and policies

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'music',
  'music',
  false,
  104857600,  -- 100MB
  ARRAY['audio/mpeg', 'audio/flac', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/aac', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy: Allow authenticated users to read objects
CREATE POLICY "Allow authenticated read access"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'music');

-- Policy: Allow service_role full access (for server-side operations)
CREATE POLICY "Allow service_role full access"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'music')
WITH CHECK (bucket_id = 'music');

-- Policy: Allow anon read access (for public artwork/avatar endpoints via signed URLs)
CREATE POLICY "Allow anon read access"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'music');
