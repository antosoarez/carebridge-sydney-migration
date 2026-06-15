
-- Tighten realtime topic authorization: scope each topic prefix to its owner or advocate role
DROP POLICY IF EXISTS "Authenticated can read app realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated realtime read" ON realtime.messages;

CREATE POLICY "Authenticated realtime topic access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'documents%'         THEN public.has_role(auth.uid(), 'advocate'::public.app_role)
    WHEN realtime.topic() LIKE 'inbound_messages%'  THEN public.has_role(auth.uid(), 'advocate'::public.app_role)
    WHEN realtime.topic() LIKE 'docs-%'             THEN
         public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR auth.uid()::text = split_part(realtime.topic(), '-', 2)
    WHEN realtime.topic() LIKE 'tasks-rt-%'         THEN
         public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR auth.uid()::text = split_part(realtime.topic(), '-', 3)
    WHEN realtime.topic() LIKE 'profile-progress-%' THEN
         public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR auth.uid()::text = split_part(realtime.topic(), '-', 3)
    ELSE false
  END
);

-- Revoke EXECUTE on SECURITY DEFINER functions from anon (and PUBLIC), keep authenticated where needed.
-- These functions perform internal auth checks but must not be callable by unauthenticated users.
REVOKE EXECUTE ON FUNCTION public.bump_client_progress(uuid, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_client_emotion_summary(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_recent_low_mood_rows(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_back_report(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_report_stage_visibility(uuid, public.report_stage, public.report_visibility) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.share_report_for_review(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.agree_report(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.recompute_client_progress(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revert_report_to_draft(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reset_report_progress(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.invalidate_user_auth_tokens(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, public, authenticated;
