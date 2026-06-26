DROP POLICY IF EXISTS "Advocates update all documents" ON public.documents;
CREATE POLICY "Advocates update all documents"
ON public.documents
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'::public.app_role))
WITH CHECK (
  public.has_role(auth.uid(), 'advocate'::public.app_role)
  AND client_id = (SELECT d.client_id FROM public.documents d WHERE d.id = documents.id)
  AND uploaded_by = (SELECT d.uploaded_by FROM public.documents d WHERE d.id = documents.id)
);