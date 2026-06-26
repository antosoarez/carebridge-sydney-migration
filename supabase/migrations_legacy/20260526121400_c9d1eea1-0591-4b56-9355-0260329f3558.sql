
-- MSG-A: Messaging schema foundation

CREATE TABLE public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  advocate_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  UNIQUE (client_id, advocate_id)
);

CREATE INDEX idx_message_threads_client ON public.message_threads(client_id);
CREATE INDEX idx_message_threads_advocate_last ON public.message_threads(advocate_id, last_message_at DESC NULLS LAST);

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own thread"
  ON public.message_threads FOR SELECT TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Advocates view all threads"
  ON public.message_threads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert threads"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates update threads"
  ON public.message_threads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete threads"
  ON public.message_threads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX idx_messages_thread_created ON public.messages(thread_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Clients: read messages in their own thread
CREATE POLICY "Clients view own thread messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = messages.thread_id AND t.client_id = auth.uid()
  ));

-- Clients: insert into their own thread, sender_id must be self
CREATE POLICY "Clients insert into own thread"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = messages.thread_id AND t.client_id = auth.uid()
    )
  );

-- Advocates: read all
CREATE POLICY "Advocates view all messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- Advocates: insert; sender_id must be self
CREATE POLICY "Advocates insert messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'advocate')
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = messages.thread_id AND t.advocate_id = auth.uid()
    )
  );

-- No UPDATE/DELETE policies for either role (denied by default).
-- Advocates can later get read_at updates in MSG-C if needed.

-- Trigger: stamp sender_role server-side from user_roles
CREATE OR REPLACE FUNCTION public.set_message_sender_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.sender_id := auth.uid();
  IF public.has_role(auth.uid(), 'advocate') THEN
    NEW.sender_role := 'advocate';
  ELSIF public.has_role(auth.uid(), 'client') THEN
    NEW.sender_role := 'client';
  ELSE
    RAISE EXCEPTION 'No valid role for message sender';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_message_sender_role
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_message_sender_role();

-- Trigger: bump last_message_at on thread
CREATE OR REPLACE FUNCTION public.bump_thread_last_message_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.message_threads
    SET last_message_at = NEW.created_at
    WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_thread_last_message_at
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_last_message_at();

-- Auto-create thread on client activation
CREATE OR REPLACE FUNCTION public.ensure_message_thread_for_client(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _advocate_id uuid;
BEGIN
  IF NOT public.has_role(_client_id, 'client') THEN
    RETURN;
  END IF;
  SELECT user_id INTO _advocate_id
    FROM public.user_roles
    WHERE role = 'advocate'
    ORDER BY created_at ASC
    LIMIT 1;
  IF _advocate_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.message_threads (client_id, advocate_id)
    VALUES (_client_id, _advocate_id)
    ON CONFLICT (client_id, advocate_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profile_activation_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.activated_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.activated_at IS NULL) THEN
    PERFORM public.ensure_message_thread_for_client(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profile_activated_create_thread
  AFTER INSERT OR UPDATE OF activated_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profile_activation_thread();

-- Backfill: create threads for already-activated clients
DO $$
DECLARE
  _advocate_id uuid;
BEGIN
  SELECT user_id INTO _advocate_id FROM public.user_roles WHERE role = 'advocate' ORDER BY created_at LIMIT 1;
  IF _advocate_id IS NOT NULL THEN
    INSERT INTO public.message_threads (client_id, advocate_id)
      SELECT p.id, _advocate_id
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'client'
       WHERE p.activated_at IS NOT NULL
      ON CONFLICT (client_id, advocate_id) DO NOTHING;
  END IF;
END $$;
