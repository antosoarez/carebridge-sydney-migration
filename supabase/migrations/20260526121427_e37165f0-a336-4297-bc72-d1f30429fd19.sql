
REVOKE EXECUTE ON FUNCTION public.set_message_sender_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_thread_last_message_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_profile_activation_thread() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_message_thread_for_client(uuid) FROM PUBLIC, anon, authenticated;
