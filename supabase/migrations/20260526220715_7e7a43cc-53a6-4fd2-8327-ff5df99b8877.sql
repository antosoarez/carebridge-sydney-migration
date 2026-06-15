
CREATE TABLE public.appointment_notification_log (
  appointment_id uuid NOT NULL,
  kind text NOT NULL,
  channel text NOT NULL,
  recipient_role text NOT NULL,
  recipient_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, kind, channel, recipient_role)
);

GRANT SELECT ON public.appointment_notification_log TO authenticated;
GRANT ALL ON public.appointment_notification_log TO service_role;

ALTER TABLE public.appointment_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates view notification log"
  ON public.appointment_notification_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'::app_role));
