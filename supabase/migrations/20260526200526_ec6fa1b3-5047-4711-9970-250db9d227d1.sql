
-- 1. attention_signals table (advocate-only)
CREATE TABLE public.attention_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  signal_type text NOT NULL,
  thread_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  auto_resolved_at timestamptz NULL,
  noted_at timestamptz NULL,
  noted_by uuid NULL
);

CREATE UNIQUE INDEX attention_signals_active_unique
  ON public.attention_signals (client_id, signal_type)
  WHERE auto_resolved_at IS NULL AND noted_at IS NULL;

CREATE INDEX attention_signals_active_idx
  ON public.attention_signals (client_id)
  WHERE auto_resolved_at IS NULL AND noted_at IS NULL;

-- Grants: advocates read/update via authenticated role; service_role full access for the edge function.
GRANT SELECT, UPDATE ON public.attention_signals TO authenticated;
GRANT ALL ON public.attention_signals TO service_role;

ALTER TABLE public.attention_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates view attention signals"
  ON public.attention_signals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates mark attention signals as noted"
  ON public.attention_signals FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- 2. messages_banner_dismissed_at on profiles
ALTER TABLE public.profiles
  ADD COLUMN messages_banner_dismissed_at timestamptz NULL;

-- 3. Replace the self-update policy WITH CHECK so messages_banner_dismissed_at is writable
--    (all other guarded fields remain immutable for self-updates).
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND email = (SELECT p.email FROM public.profiles p WHERE p.id = profiles.id)
    AND tier = (SELECT p.tier FROM public.profiles p WHERE p.id = profiles.id)
    AND report_status = (SELECT p.report_status FROM public.profiles p WHERE p.id = profiles.id)
    AND client_colour = (SELECT p.client_colour FROM public.profiles p WHERE p.id = profiles.id)
    AND payment_status = (SELECT p.payment_status FROM public.profiles p WHERE p.id = profiles.id)
    AND client_progress = (SELECT p.client_progress FROM public.profiles p WHERE p.id = profiles.id)
    AND must_change_password = (SELECT p.must_change_password FROM public.profiles p WHERE p.id = profiles.id)
    AND NOT (activated_at IS DISTINCT FROM (SELECT p.activated_at FROM public.profiles p WHERE p.id = profiles.id))
  );

-- 4. Extend mark_thread_read to auto-resolve unread_messages_24h signals
CREATE OR REPLACE FUNCTION public.mark_thread_read(_thread_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Auto-resolve any active unread-messages attention signal for this client/thread.
  UPDATE public.attention_signals
    SET auto_resolved_at = now()
    WHERE client_id = uid
      AND thread_id = _thread_id
      AND signal_type = 'unread_messages_24h'
      AND auto_resolved_at IS NULL
      AND noted_at IS NULL;

  RETURN updated_count;
END;
$function$;
