
-- Add DELETE policy on documents table for advocates (allow removing wrong uploads)
CREATE POLICY "Advocates delete documents"
ON public.documents
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'advocate'::app_role));

-- Storage policies for my-documents bucket: advocate/admin only
CREATE POLICY "Advocates read my-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'my-documents' AND has_role(auth.uid(), 'advocate'::app_role));

CREATE POLICY "Advocates insert my-documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'my-documents' AND has_role(auth.uid(), 'advocate'::app_role));

CREATE POLICY "Advocates update my-documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'my-documents' AND has_role(auth.uid(), 'advocate'::app_role));

CREATE POLICY "Advocates delete my-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'my-documents' AND has_role(auth.uid(), 'advocate'::app_role));
