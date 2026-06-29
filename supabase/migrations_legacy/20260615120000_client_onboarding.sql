-- Client onboarding: preferences on profile + audit trail of consents

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS preferred_language text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text;

CREATE TABLE IF NOT EXISTS public.client_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('scope_acknowledgment', 'privacy_consent')),
  language text NOT NULL DEFAULT 'en',
  consent_text text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_consents_user ON public.client_consents(user_id, kind);

GRANT SELECT, INSERT ON public.client_consents TO authenticated;
GRANT ALL ON public.client_consents TO service_role;

ALTER TABLE public.client_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own consents"
  ON public.client_consents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own consents"
  ON public.client_consents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'advocate'));
