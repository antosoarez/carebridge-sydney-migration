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
      public.has_role(auth.uid(), 'advocate'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.reports r
        WHERE r.id::text = substring(realtime.topic() from '^report-comments-([0-9a-fA-F-]{36})')
          AND r.client_id = auth.uid()
          AND r.visibility = 'shared'::public.report_visibility
      )
    )
    ELSE false
  END
);