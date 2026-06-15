-- 1) Hide token_hash from authenticated readers (advocates). Service role keeps full access.
REVOKE SELECT (token_hash) ON public.email_change_requests FROM authenticated;
REVOKE SELECT (token_hash) ON public.email_change_requests FROM anon;

-- 2) Lock down internal trigger functions so they can't be invoked via PostgREST.
REVOKE EXECUTE ON FUNCTION public.client_cases_sync_next_action_task() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_task_on_new_enquiry() FROM PUBLIC, anon, authenticated;