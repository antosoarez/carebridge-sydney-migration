-- Mark all messages in a thread (sent by the OTHER party) as read for the current user.
CREATE OR REPLACE FUNCTION public.mark_thread_read(_thread_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_member boolean;
  updated_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = _thread_id
      AND (t.client_id = uid OR t.advocate_id = uid)
  ) INTO is_member;

  IF NOT is_member THEN
    RAISE EXCEPTION 'Not a member of this thread';
  END IF;

  UPDATE public.messages
    SET read_at = now()
    WHERE thread_id = _thread_id
      AND read_at IS NULL
      AND sender_id <> uid;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_thread_read(uuid) TO authenticated;
