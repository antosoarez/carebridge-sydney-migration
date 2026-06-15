CREATE POLICY "Clients view own emotion logs"
ON public.emotion_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Clients insert own documents" ON public.documents;
CREATE POLICY "Clients insert own documents"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = client_id
  AND auth.uid() = uploaded_by
  AND split_part(storage_path, '/', 1) = auth.uid()::text
);