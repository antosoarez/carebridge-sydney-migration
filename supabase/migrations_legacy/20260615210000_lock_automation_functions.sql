-- Lock down SECURITY DEFINER automation functions so only service_role can invoke them.
REVOKE ALL ON FUNCTION public.run_automations(text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_automations(text, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.run_automations(text, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_automations(text, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.scan_stage_timeouts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scan_stage_timeouts() FROM anon;
REVOKE ALL ON FUNCTION public.scan_stage_timeouts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.scan_stage_timeouts() TO service_role;

REVOKE ALL ON FUNCTION public.client_has_all_required_agreements(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_has_all_required_agreements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.client_has_all_required_agreements(uuid) TO authenticated, service_role;
