
REVOKE ALL ON FUNCTION public.guard_profile_advocate_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_client(uuid) TO authenticated;
