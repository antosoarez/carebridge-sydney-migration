-- Restrict calculate_client_urgency: only service_role may call directly.
-- Trigger wrappers and recalculate_all_active_client_urgency are SECURITY DEFINER
-- owned by superuser and bypass function EXECUTE privilege checks.
REVOKE EXECUTE ON FUNCTION public.calculate_client_urgency(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_client_urgency(uuid) TO service_role;

-- Defense in depth: add an in-function guard so even if EXECUTE is granted,
-- only advocates or service_role contexts succeed.
CREATE OR REPLACE FUNCTION public.calculate_client_urgency(p_client_id uuid)
RETURNS TABLE(urgency_score integer, urgency_level text, signals jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Allow when invoked with no JWT (cron / service_role / definer trigger ctx
  -- where auth.uid() is null) or by an advocate. Block any direct authenticated
  -- client-user invocation.
  IF v_uid IS NOT NULL AND NOT public.has_role(v_uid, 'advocate') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public._calculate_client_urgency_impl(p_client_id);
END;
$fn$;

-- Move the original body into an internal impl function callable only by definer/service_role.
-- (If _impl already exists from a prior run, replace it.)
