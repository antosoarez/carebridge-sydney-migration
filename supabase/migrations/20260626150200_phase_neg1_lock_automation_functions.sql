-- =====================================================================
-- Phase -1: lock automation dispatcher functions to service_role
-- ---------------------------------------------------------------------
-- run_automations / scan_stage_timeouts must not be callable via PostgREST
-- by anon/authenticated. Triggers still invoke them (SECURITY DEFINER, run
-- as owner). Scheduled jobs call scan_stage_timeouts as service_role.
-- =====================================================================

REVOKE ALL ON FUNCTION public.run_automations(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_automations(text, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.scan_stage_timeouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_stage_timeouts() TO service_role;
