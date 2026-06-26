CREATE POLICY "Clients insert own availability options"
ON public.availability_options
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.availability_requests ar
    WHERE ar.id = availability_options.availability_request_id
      AND ar.client_id = auth.uid()
      AND ar.status = ANY (ARRAY['sent_to_client'::text, 'waiting_for_client'::text])
  )
);

CREATE POLICY "Clients delete own availability options"
ON public.availability_options
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.availability_requests ar
    WHERE ar.id = availability_options.availability_request_id
      AND ar.client_id = auth.uid()
      AND ar.status = ANY (ARRAY['sent_to_client'::text, 'waiting_for_client'::text])
  )
);