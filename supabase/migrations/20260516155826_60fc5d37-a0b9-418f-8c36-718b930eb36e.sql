
CREATE TABLE public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

CREATE INDEX idx_mfa_recovery_codes_user ON public.mfa_recovery_codes(user_id);

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own recovery codes"
  ON public.mfa_recovery_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own recovery codes"
  ON public.mfa_recovery_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own recovery codes"
  ON public.mfa_recovery_codes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own recovery codes"
  ON public.mfa_recovery_codes FOR DELETE
  USING (auth.uid() = user_id);
