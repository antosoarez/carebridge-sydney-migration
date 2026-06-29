-- 1. Require aal2 to insert/update trusted devices
DROP POLICY IF EXISTS "Users insert own trusted devices" ON public.trusted_devices;
DROP POLICY IF EXISTS "Users update own trusted devices" ON public.trusted_devices;

CREATE POLICY "Users insert own trusted devices"
ON public.trusted_devices
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND COALESCE((auth.jwt() ->> 'aal'), '') = 'aal2'
);

CREATE POLICY "Users update own trusted devices"
ON public.trusted_devices
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND COALESCE((auth.jwt() ->> 'aal'), '') = 'aal2'
)
WITH CHECK (
  auth.uid() = user_id
  AND COALESCE((auth.jwt() ->> 'aal'), '') = 'aal2'
);

-- 2. Hide sensitive columns on email_change_requests from clients (column-level)
REVOKE SELECT ON public.email_change_requests FROM authenticated;
GRANT SELECT (
  id, user_id, old_email, new_email, initiator_role, initiated_by,
  status, expires_at, created_at, verified_at, cancelled_at
) ON public.email_change_requests TO authenticated;