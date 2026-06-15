
-- 1. Visibility column
DO $$ BEGIN
  CREATE TYPE public.document_visibility AS ENUM ('shared','advocate_private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility public.document_visibility NOT NULL DEFAULT 'shared';

-- 2. RLS: advocates can insert documents (for any client_id, and for own private folder)
DROP POLICY IF EXISTS "Advocates insert documents" ON public.documents;
CREATE POLICY "Advocates insert documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'advocate'::app_role)
    AND uploaded_by = auth.uid()
  );

-- 3. Tighten client SELECT to exclude advocate-private (defense in depth)
DROP POLICY IF EXISTS "Clients view own documents" ON public.documents;
CREATE POLICY "Clients view own documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id AND visibility = 'shared');

-- 4. Storage: allow advocates to upload to client-documents bucket
DROP POLICY IF EXISTS "Advocates upload to client documents" ON storage.objects;
CREATE POLICY "Advocates upload to client documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND has_role(auth.uid(), 'advocate'::app_role)
  );
