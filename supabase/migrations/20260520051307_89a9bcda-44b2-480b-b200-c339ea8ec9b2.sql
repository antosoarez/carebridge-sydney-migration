
CREATE TABLE public.email_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_email text NOT NULL,
  new_email text NOT NULL,
  initiated_by uuid NOT NULL,
  initiator_role text NOT NULL CHECK (initiator_role IN ('advocate','client')),
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','cancelled','expired','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  verified_at timestamptz,
  cancelled_at timestamptz,
  error_message text
);

CREATE UNIQUE INDEX email_change_one_pending_per_user
  ON public.email_change_requests(user_id) WHERE status = 'pending';
CREATE INDEX email_change_token_hash_idx ON public.email_change_requests(token_hash);
CREATE INDEX email_change_user_idx ON public.email_change_requests(user_id, created_at DESC);

ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates view all email change requests"
  ON public.email_change_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Clients view own email change requests"
  ON public.email_change_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
