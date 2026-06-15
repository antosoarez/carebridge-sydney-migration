-- Optional, non-clinical navigation intake from the client (in their own words).
-- Stored securely; visible to the client and their advocate.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS navigation_intake_seen_at timestamptz;

CREATE TABLE IF NOT EXISTS public.client_navigation_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.client_cases(id) ON DELETE SET NULL,
  language text NOT NULL DEFAULT 'en',
  help_with text,
  whats_going_on text,
  step_contacted_gp boolean NOT NULL DEFAULT false,
  step_got_referral boolean NOT NULL DEFAULT false,
  step_appointment_booked boolean NOT NULL DEFAULT false,
  steps_notes text,
  matters_most text,
  source text NOT NULL DEFAULT 'onboarding',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_navigation_intake_client
  ON public.client_navigation_intake(client_id);
CREATE INDEX IF NOT EXISTS idx_client_navigation_intake_case
  ON public.client_navigation_intake(case_id);

GRANT SELECT, INSERT, UPDATE ON public.client_navigation_intake TO authenticated;
GRANT ALL ON public.client_navigation_intake TO service_role;

ALTER TABLE public.client_navigation_intake ENABLE ROW LEVEL SECURITY;

-- Client can manage their own intake rows.
CREATE POLICY "Client can view own intake"
  ON public.client_navigation_intake
  FOR SELECT
  TO authenticated
  USING (client_id = auth.uid() OR public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Client can insert own intake"
  ON public.client_navigation_intake
  FOR INSERT
  TO authenticated
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Client can update own intake"
  ON public.client_navigation_intake
  FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Advocates can update intake notes alongside their clients.
CREATE POLICY "Advocates can update intake"
  ON public.client_navigation_intake
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- Keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_client_navigation_intake()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_client_navigation_intake ON public.client_navigation_intake;
CREATE TRIGGER trg_touch_client_navigation_intake
  BEFORE UPDATE ON public.client_navigation_intake
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_navigation_intake();
