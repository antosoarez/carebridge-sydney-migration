CREATE TABLE public.trusted_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  label text,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trusted_devices_user ON public.trusted_devices(user_id);
CREATE UNIQUE INDEX idx_trusted_devices_user_hash ON public.trusted_devices(user_id, token_hash);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own trusted devices"
ON public.trusted_devices FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own trusted devices"
ON public.trusted_devices FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own trusted devices"
ON public.trusted_devices FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own trusted devices"
ON public.trusted_devices FOR DELETE
USING (auth.uid() = user_id);