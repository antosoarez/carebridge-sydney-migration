
-- Allow clients to update and delete their own uploaded files in client-documents
-- (excluding the 'reports' subfolder which is advocate-managed)
CREATE POLICY "Clients update own files (non-reports)"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND ((storage.foldername(name))[2] IS DISTINCT FROM 'reports')
)
WITH CHECK (
  bucket_id = 'client-documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND ((storage.foldername(name))[2] IS DISTINCT FROM 'reports')
);

CREATE POLICY "Clients delete own files (non-reports)"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND ((storage.foldername(name))[2] IS DISTINCT FROM 'reports')
);

-- Tighten Realtime channel authorization: explicitly allow authenticated users
-- to subscribe to the topic patterns the app actually uses for postgres_changes.
-- Row-level visibility is still enforced by the underlying tables' RLS.
DROP POLICY IF EXISTS "Authenticated can read app realtime topics" ON realtime.messages;
CREATE POLICY "Authenticated can read app realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'documents%')
  OR (realtime.topic() LIKE 'docs-%')
  OR (realtime.topic() LIKE 'inbound_messages%')
  OR (realtime.topic() LIKE 'tasks-rt-%')
  OR (realtime.topic() LIKE 'profile-progress-%')
);
