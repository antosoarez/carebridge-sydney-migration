DROP POLICY IF EXISTS "Authenticated realtime read" ON realtime.messages;

CREATE POLICY "Authenticated realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'documents%' THEN has_role(auth.uid(), 'advocate'::app_role)
    WHEN realtime.topic() LIKE 'inbound_messages%' THEN has_role(auth.uid(), 'advocate'::app_role)
    ELSE true
  END
);