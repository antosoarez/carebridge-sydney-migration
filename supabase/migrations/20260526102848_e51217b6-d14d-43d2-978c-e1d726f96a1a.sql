
-- 1) Fix realtime topic UUID extraction (split_part was truncating UUIDs at first hyphen)
DROP POLICY IF EXISTS "Authenticated realtime topic access" ON realtime.messages;

CREATE POLICY "Authenticated realtime topic access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'documents%' THEN public.has_role(auth.uid(), 'advocate'::public.app_role)
    WHEN realtime.topic() LIKE 'inbound_messages%' THEN public.has_role(auth.uid(), 'advocate'::public.app_role)
    WHEN realtime.topic() LIKE 'docs-%' THEN (
      public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR (auth.uid())::text = substring(realtime.topic() from '^docs-(.+)$')
    )
    WHEN realtime.topic() LIKE 'tasks-rt-%' THEN (
      public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR (auth.uid())::text = substring(realtime.topic() from '^tasks-rt-([0-9a-fA-F-]{36})')
    )
    WHEN realtime.topic() LIKE 'profile-progress-%' THEN (
      public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR (auth.uid())::text = substring(realtime.topic() from '^profile-progress-(.+)$')
    )
    WHEN realtime.topic() LIKE 'reports-%' THEN (
      public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR (auth.uid())::text = substring(realtime.topic() from '^reports-(.+)$')
    )
    WHEN realtime.topic() LIKE 'report-comments-%' THEN (
      public.has_role(auth.uid(), 'advocate'::public.app_role) OR auth.uid() IS NOT NULL
    )
    ELSE false
  END
);

-- 2) Allow clients to read their own client_report_meta row
CREATE POLICY "Clients view own report meta"
ON public.client_report_meta
FOR SELECT
TO authenticated
USING (auth.uid() = client_id);

-- 3) Revoke EXECUTE on trigger function from anon/public (linter flag)
REVOKE EXECUTE ON FUNCTION public.log_task_status_event() FROM anon, public;
