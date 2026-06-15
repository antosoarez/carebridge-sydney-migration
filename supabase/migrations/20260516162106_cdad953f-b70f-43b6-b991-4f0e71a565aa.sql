CREATE TYPE public.inbound_message_status AS ENUM ('new', 'read', 'archived');

CREATE TABLE public.inbound_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text,
  message text NOT NULL,
  status public.inbound_message_status NOT NULL DEFAULT 'new',
  read_at timestamptz,
  archived_at timestamptz,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_messages_status_created ON public.inbound_messages (status, created_at DESC);

ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authenticated) can submit a message
CREATE POLICY "Anyone can submit an inbound message"
ON public.inbound_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(name) BETWEEN 1 AND 120
  AND char_length(email) BETWEEN 3 AND 255
  AND char_length(message) BETWEEN 1 AND 5000
  AND (subject IS NULL OR char_length(subject) <= 200)
  AND (phone IS NULL OR char_length(phone) <= 40)
  AND status = 'new'
  AND read_at IS NULL
  AND archived_at IS NULL
);

-- Only advocates can read inbound messages
CREATE POLICY "Advocates view inbound messages"
ON public.inbound_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'));

-- Only advocates can update (mark read / archive)
CREATE POLICY "Advocates update inbound messages"
ON public.inbound_messages
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- Only advocates can delete
CREATE POLICY "Advocates delete inbound messages"
ON public.inbound_messages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'));