
-- notification_settings: per-user preferences
CREATE TABLE public.notification_settings (
  user_id uuid PRIMARY KEY,
  email_on_new_message boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT true,
  quiet_start time NOT NULL DEFAULT '22:00',
  quiet_end time NOT NULL DEFAULT '07:00',
  timezone text NOT NULL DEFAULT 'Australia/Perth',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notification settings"
  ON public.notification_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notification settings"
  ON public.notification_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own notification settings"
  ON public.notification_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- message_notification_log: audit of emails sent (no message bodies, ever)
CREATE TABLE public.message_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  email_number smallint NOT NULL CHECK (email_number IN (1, 2)),
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_notif_log_thread_user
  ON public.message_notification_log (thread_id, user_id, sent_at DESC);

GRANT SELECT ON public.message_notification_log TO authenticated;
GRANT ALL ON public.message_notification_log TO service_role;

ALTER TABLE public.message_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own message notification log"
  ON public.message_notification_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Patch mark_thread_read to clear the recipient's log for this thread
-- so the next round of unread messages starts a fresh email-1/email-2 cycle.
CREATE OR REPLACE FUNCTION public.mark_thread_read(_thread_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_member boolean;
  updated_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.message_threads t
    WHERE t.id = _thread_id
      AND (t.client_id = uid OR t.advocate_id = uid)
  ) INTO is_member;

  IF NOT is_member THEN
    RAISE EXCEPTION 'Not a member of this thread';
  END IF;

  UPDATE public.messages
    SET read_at = now()
    WHERE thread_id = _thread_id
      AND read_at IS NULL
      AND sender_id <> uid;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  DELETE FROM public.message_notification_log
    WHERE thread_id = _thread_id AND user_id = uid;

  RETURN updated_count;
END;
$$;

-- Extend handle_new_user to seed default notification_settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  IF lower(NEW.email) = 'hello@carebridgeperth.com' THEN
    assigned_role := 'advocate';
  ELSE
    assigned_role := 'client';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  INSERT INTO public.notification_settings (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill notification_settings rows for existing users so the edge function
-- can find them without nullable assumptions.
INSERT INTO public.notification_settings (user_id)
  SELECT id FROM public.profiles
  ON CONFLICT (user_id) DO NOTHING;
