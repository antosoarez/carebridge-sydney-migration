-- =====================================================================
-- Phase 1: automation notification outbox
-- ---------------------------------------------------------------------
-- run_automations runs synchronously inside triggers, so it must not do
-- outbound HTTP (a Resend failure would roll back the user's action). Instead
-- the new 'notify' action enqueues a client-safe row here; an edge function
-- (dispatch-automation-outbox) drains it and sends via Resend + in-app.
--
-- NO PHI is ever stored here: vars carry only client-safe values (names,
-- links, amounts). client_id = the subject of the notification; to_user_id =
-- the recipient (== client_id for client notifications, the advocate for
-- advocate notifications).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.automation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  client_id uuid,
  to_user_id uuid NOT NULL,
  to_role text NOT NULL CHECK (to_role IN ('client','advocate')),
  channels text[] NOT NULL DEFAULT ARRAY['email','inapp'],
  template text NOT NULL,
  vars jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','error')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS automation_outbox_pending_idx
  ON public.automation_outbox (created_at)
  WHERE status = 'pending';

GRANT ALL ON public.automation_outbox TO service_role;
ALTER TABLE public.automation_outbox ENABLE ROW LEVEL SECURITY;
-- Only the service role (edge dispatcher) writes/reads for delivery. Advocates
-- may read for observability. No anon/authenticated writes.
DROP POLICY IF EXISTS "advocates read outbox" ON public.automation_outbox;
CREATE POLICY "advocates read outbox" ON public.automation_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));
