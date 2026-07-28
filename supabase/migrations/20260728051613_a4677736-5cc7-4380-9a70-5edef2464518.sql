
CREATE POLICY "brand-assets public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'brand-assets');

CREATE POLICY "brand-assets auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "brand-assets auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "brand-assets auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
