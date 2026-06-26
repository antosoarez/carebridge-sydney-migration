CREATE OR REPLACE FUNCTION public.get_my_advocate()
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email
      FROM public.message_threads t
      JOIN public.profiles p ON p.id = t.advocate_id
     WHERE t.client_id = uid
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_advocate() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_advocate() TO authenticated;