-- =====================================================================
-- Phase 0.4 (support): mark_client_invited RPC
-- ---------------------------------------------------------------------
-- Edge functions (admin-create-client, invite-client) run as service_role,
-- which has auth.uid() = NULL, so guard_profile_advocate_fields() blocks any
-- direct write to profiles.lifecycle_status. This SECURITY DEFINER RPC sets
-- the existing recompute bypass GUC (txn-local) and flips a freshly-created
-- client's lifecycle from the 'New enquiry' default to 'Invited', so the
-- enquiry_created automation does not fire for invited/converted clients.
-- Only flips when currently 'New enquiry' to avoid clobbering real states.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.mark_client_invited(_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev_bypass text;
BEGIN
  v_prev_bypass := current_setting('app.recomputing_progress', true);
  PERFORM set_config('app.recomputing_progress', 'on', true);
  UPDATE public.profiles
     SET lifecycle_status = 'Invited'
   WHERE id = _client_id
     AND lifecycle_status = 'New enquiry';
  PERFORM set_config('app.recomputing_progress', COALESCE(v_prev_bypass, 'off'), true);
END $$;

REVOKE ALL ON FUNCTION public.mark_client_invited(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_client_invited(uuid) TO service_role;
