
-- 1) mfa_recovery_codes: remove SELECT exposure, replace with count helper
DROP POLICY IF EXISTS "Users view own recovery codes" ON public.mfa_recovery_codes;

CREATE OR REPLACE FUNCTION public.count_my_active_recovery_codes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
    FROM public.mfa_recovery_codes
   WHERE user_id = auth.uid()
     AND used_at IS NULL
$$;
REVOKE EXECUTE ON FUNCTION public.count_my_active_recovery_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_my_active_recovery_codes() TO authenticated;

-- 2) trusted_devices: remove SELECT exposure, replace with safe helpers
DROP POLICY IF EXISTS "Users view own trusted devices" ON public.trusted_devices;

CREATE OR REPLACE FUNCTION public.list_my_trusted_devices()
RETURNS TABLE(id uuid, label text, expires_at timestamptz, last_used_at timestamptz, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT td.id, td.label, td.expires_at, td.last_used_at, td.created_at
    FROM public.trusted_devices td
   WHERE td.user_id = auth.uid()
   ORDER BY td.last_used_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_trusted_devices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_trusted_devices() TO authenticated;

CREATE OR REPLACE FUNCTION public.find_my_trusted_device(_token_hash text)
RETURNS TABLE(id uuid, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT td.id, td.expires_at
    FROM public.trusted_devices td
   WHERE td.user_id = auth.uid()
     AND td.token_hash = _token_hash
   LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.find_my_trusted_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_my_trusted_device(text) TO authenticated;

-- 3) email_change_requests: client may only see self-initiated requests
DROP POLICY IF EXISTS "Clients view own email change requests" ON public.email_change_requests;
CREATE POLICY "Clients view own self-initiated email change requests"
  ON public.email_change_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND initiator_role = 'client');

-- 4) appointments: hide advocate_private_notes from direct table reads;
--    advocates fetch through a dedicated helper.
REVOKE SELECT (advocate_private_notes) ON public.appointments FROM authenticated;
REVOKE SELECT (advocate_private_notes) ON public.appointments FROM anon;
REVOKE SELECT (advocate_private_notes) ON public.appointments FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_appointment_private_notes_map()
RETURNS TABLE(id uuid, advocate_private_notes text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT a.id, a.advocate_private_notes
      FROM public.appointments a
     WHERE a.advocate_private_notes IS NOT NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_appointment_private_notes_map() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_private_notes_map() TO authenticated;
