
-- 1. payment_settings: restrict bank details to advocates + clients with outstanding invoices
DROP POLICY IF EXISTS "Anyone authenticated can read settings" ON public.payment_settings;

CREATE POLICY "Advocates and clients with outstanding invoices can read settings"
ON public.payment_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'advocate'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.client_payments cp
    WHERE cp.client_id = auth.uid()
      AND cp.invoice_given = true
      AND cp.paid = false
  )
);

-- 2. documents: pin status/triaged_at/triaged_by for client uploads
DROP POLICY IF EXISTS "Clients insert own documents" ON public.documents;

CREATE POLICY "Clients insert own documents"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = client_id
  AND auth.uid() = uploaded_by
  AND split_part(storage_path, '/', 1) = (auth.uid())::text
  AND status = 'pending_review'::public.document_status
  AND triaged_at IS NULL
  AND triaged_by IS NULL
);

-- 3. profiles: pin email in self-update
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND email = (SELECT p.email FROM public.profiles p WHERE p.id = profiles.id)
  AND tier = (SELECT p.tier FROM public.profiles p WHERE p.id = profiles.id)
  AND report_status = (SELECT p.report_status FROM public.profiles p WHERE p.id = profiles.id)
  AND client_colour = (SELECT p.client_colour FROM public.profiles p WHERE p.id = profiles.id)
  AND payment_status = (SELECT p.payment_status FROM public.profiles p WHERE p.id = profiles.id)
  AND client_progress = (SELECT p.client_progress FROM public.profiles p WHERE p.id = profiles.id)
  AND must_change_password = (SELECT p.must_change_password FROM public.profiles p WHERE p.id = profiles.id)
  AND NOT (activated_at IS DISTINCT FROM (SELECT p.activated_at FROM public.profiles p WHERE p.id = profiles.id))
);
