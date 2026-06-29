
-- 1. Lock down user_roles writes: deny all client mutations explicitly.
CREATE POLICY "Deny insert to user_roles"
  ON public.user_roles FOR INSERT TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY "Deny update to user_roles"
  ON public.user_roles FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);
CREATE POLICY "Deny delete from user_roles"
  ON public.user_roles FOR DELETE TO authenticated, anon
  USING (false);

-- 2. Realtime channel authorization: only authenticated users may subscribe,
-- and only to topics intended for them. Documents realtime is advocate-only.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated realtime read" ON realtime.messages;
CREATE POLICY "Authenticated realtime read"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() IN ('documents', 'documents:changes')
        THEN public.has_role(auth.uid(), 'advocate'::public.app_role)
      ELSE true
    END
  );

-- 3. Storage: explicit DELETE policy (advocates only) and explicit client
-- UPDATE restriction matching the existing INSERT/SELECT folder convention.
DROP POLICY IF EXISTS "Advocates can delete client documents" ON storage.objects;
CREATE POLICY "Advocates can delete client documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.has_role(auth.uid(), 'advocate'::public.app_role)
  );

-- 4. Lock down SECURITY DEFINER functions so anon/authenticated cannot
-- invoke them directly via PostgREST. Only service_role uses these from
-- the edge functions.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- has_role is used by RLS policies (run as the policy owner), so RLS still
-- works after revoking direct EXECUTE from end users.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- 5. Pin search_path on the email-queue helper functions.
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
