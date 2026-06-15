
-- =====================================================================
-- 1. Profile columns
-- =====================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS urgency_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS urgency_level text NOT NULL DEFAULT 'Stable',
  ADD COLUMN IF NOT EXISTS last_urgency_calculated_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_urgency_level_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_urgency_level_chk
  CHECK (urgency_level IN ('Critical','High','Medium','Low','Stable'));

-- Update guard so urgency_* fields are NOT in the locked-down list
-- (they are only written by the SECURITY DEFINER urgency function).
-- Existing guard already only blocks a fixed list of columns, so no change needed.

-- =====================================================================
-- 2. calculate_client_urgency
-- =====================================================================
CREATE OR REPLACE FUNCTION public.calculate_client_urgency(p_client_id uuid)
RETURNS TABLE(score integer, level text, signals jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s int := 0;
  sigs jsonb := '[]'::jsonb;
  lvl text;
  v_low_mood_count int;
  v_oldest_unread timestamptz;
  v_unread_hours numeric;
  v_appt_24 timestamptz;
  v_has_prep boolean;
  v_appt_48 timestamptz;
  v_appt_7d timestamptz;
  v_overdue_payment int;
  v_pending_doc int;
  v_waiting_case int;
  v_report_feedback int;
  v_lifecycle text;
  v_activated timestamptz;
  v_followup_no_action int;
  v_inactive_days int;
  v_open_case_no_due int;
  v_last_activity timestamptz;
BEGIN
  IF p_client_id IS NULL THEN
    RETURN QUERY SELECT 0, 'Stable'::text, '[]'::jsonb;
    RETURN;
  END IF;

  SELECT lifecycle_status::text, activated_at
    INTO v_lifecycle, v_activated
    FROM public.profiles WHERE id = p_client_id;

  -- CRITICAL: 3+ low-mood emotion logs in last 7d (+30)
  SELECT COUNT(*) INTO v_low_mood_count
    FROM public.emotion_logs
    WHERE user_id = p_client_id
      AND created_at >= now() - interval '7 days'
      AND emotion = ANY (ARRAY['sad','overwhelmed','anxious','tired']);
  IF v_low_mood_count >= 3 THEN
    s := s + 30;
    sigs := sigs || jsonb_build_object('label', v_low_mood_count || ' low moods this week', 'points', 30);
  END IF;

  -- Unread client message age
  SELECT MIN(m.created_at) INTO v_oldest_unread
    FROM public.messages m
    JOIN public.message_threads t ON t.id = m.thread_id
   WHERE t.client_id = p_client_id
     AND m.sender_role = 'client'
     AND m.read_at IS NULL;

  IF v_oldest_unread IS NOT NULL THEN
    v_unread_hours := EXTRACT(EPOCH FROM (now() - v_oldest_unread)) / 3600.0;
    IF v_unread_hours >= 48 THEN
      s := s + 25;
      sigs := sigs || jsonb_build_object('label', 'Message unread ' || round(v_unread_hours)::text || 'h', 'points', 25);
    ELSIF v_unread_hours >= 24 THEN
      s := s + 15;
      sigs := sigs || jsonb_build_object('label', 'Message unread ' || round(v_unread_hours)::text || 'h', 'points', 15);
    END IF;
  END IF;

  -- Appointment in next 24h without completed prep task (+25)
  SELECT MIN(starts_at) INTO v_appt_24
    FROM public.appointments
   WHERE client_id = p_client_id
     AND outcome = 'scheduled'
     AND starts_at BETWEEN now() AND now() + interval '24 hours';
  IF v_appt_24 IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tasks
       WHERE client_id = p_client_id
         AND status = 'complete'
         AND auto_dedup_key LIKE 'prep_appt:%'
         AND completed_at >= now() - interval '7 days'
    ) INTO v_has_prep;
    IF NOT v_has_prep THEN
      s := s + 25;
      sigs := sigs || jsonb_build_object('label','Appointment tomorrow — no prep','points',25);
    END IF;
  END IF;

  -- Unpaid invoice + fee arrangement older than 14d (+15)
  SELECT COUNT(*) INTO v_overdue_payment
    FROM public.client_payments cp
    JOIN public.client_fee_arrangements fa ON fa.client_id = cp.client_id
   WHERE cp.client_id = p_client_id
     AND cp.paid = false
     AND cp.invoice_given = true
     AND fa.created_at < now() - interval '14 days';
  IF v_overdue_payment > 0 THEN
    s := s + 15;
    sigs := sigs || jsonb_build_object('label','Unpaid invoice 14+ days','points',15);
  END IF;

  -- HIGH: Appointment in next 48h but not 24h (+15)
  IF v_appt_24 IS NULL THEN
    SELECT MIN(starts_at) INTO v_appt_48
      FROM public.appointments
     WHERE client_id = p_client_id
       AND outcome = 'scheduled'
       AND starts_at BETWEEN now() + interval '24 hours' AND now() + interval '48 hours';
    IF v_appt_48 IS NOT NULL THEN
      s := s + 15;
      sigs := sigs || jsonb_build_object('label','Appointment within 48h','points',15);
    END IF;
  END IF;

  -- Doc uploaded by client, still pending review, >48h old (+10)
  SELECT COUNT(*) INTO v_pending_doc
    FROM public.documents
   WHERE uploaded_by = p_client_id
     AND client_id = p_client_id
     AND status = 'pending_review'
     AND created_at < now() - interval '48 hours';
  IF v_pending_doc > 0 THEN
    s := s + 10;
    sigs := sigs || jsonb_build_object('label','Uploaded doc awaiting review','points',10);
  END IF;

  -- Case waiting on client 7+ days with no recent activity (+10)
  -- Activity = message or document in last 7 days from client
  SELECT COUNT(*) INTO v_waiting_case
    FROM public.client_cases c
   WHERE c.client_id = p_client_id
     AND c.case_status = 'Waiting on client'
     AND c.updated_at < now() - interval '7 days'
     AND NOT EXISTS (
       SELECT 1 FROM public.messages m
       JOIN public.message_threads t ON t.id = m.thread_id
       WHERE t.client_id = p_client_id
         AND m.sender_role = 'client'
         AND m.created_at >= now() - interval '7 days'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.documents d
       WHERE d.uploaded_by = p_client_id
         AND d.created_at >= now() - interval '7 days'
     );
  IF v_waiting_case > 0 THEN
    s := s + 10;
    sigs := sigs || jsonb_build_object('label','Case waiting on client 7+ days','points',10);
  END IF;

  -- Report feedback received but not reviewed (+10)
  SELECT COUNT(*) INTO v_report_feedback
    FROM public.reports
   WHERE client_id = p_client_id
     AND client_feedback IS NOT NULL
     AND status = 'shared_for_review'
     AND client_agreed_at IS NULL;
  IF v_report_feedback > 0 THEN
    s := s + 10;
    sigs := sigs || jsonb_build_object('label','Report feedback awaiting review','points',10);
  END IF;

  -- MEDIUM: Onboarding incomplete + activated >5d ago (+8)
  IF v_lifecycle = 'Onboarding incomplete'
     AND v_activated IS NOT NULL
     AND v_activated < now() - interval '5 days' THEN
    s := s + 8;
    sigs := sigs || jsonb_build_object('label','Onboarding incomplete 5+ days','points',8);
  END IF;

  -- Follow-up required with no next_action on any open case (+8)
  IF v_lifecycle = 'Follow-up required' THEN
    SELECT COUNT(*) INTO v_followup_no_action
      FROM public.client_cases
     WHERE client_id = p_client_id
       AND case_status NOT IN ('Completed','Closed')
       AND (next_action IS NULL OR next_action_due_at IS NULL);
    IF v_followup_no_action > 0 OR NOT EXISTS (
      SELECT 1 FROM public.client_cases
       WHERE client_id = p_client_id AND case_status NOT IN ('Completed','Closed')
    ) THEN
      s := s + 8;
      sigs := sigs || jsonb_build_object('label','Follow-up required, no next action','points',8);
    END IF;
  END IF;

  -- Appointment in next 7d but not next 48h (+5)
  IF v_appt_24 IS NULL AND v_appt_48 IS NULL THEN
    SELECT MIN(starts_at) INTO v_appt_7d
      FROM public.appointments
     WHERE client_id = p_client_id
       AND outcome = 'scheduled'
       AND starts_at BETWEEN now() + interval '48 hours' AND now() + interval '7 days';
    IF v_appt_7d IS NOT NULL THEN
      s := s + 5;
      sigs := sigs || jsonb_build_object('label','Appointment within 7 days','points',5);
    END IF;
  END IF;

  -- LOW: No client activity in 14+ days (+5)
  SELECT GREATEST(
    COALESCE((SELECT MAX(m.created_at) FROM public.messages m
              JOIN public.message_threads t ON t.id = m.thread_id
              WHERE t.client_id = p_client_id AND m.sender_role = 'client'), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM public.documents WHERE uploaded_by = p_client_id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM public.emotion_logs WHERE user_id = p_client_id), 'epoch'::timestamptz)
  ) INTO v_last_activity;
  IF v_last_activity < now() - interval '14 days' THEN
    s := s + 5;
    sigs := sigs || jsonb_build_object('label','No client activity in 14+ days','points',5);
  END IF;

  -- Open case with NULL next_action_due_at (+3)
  SELECT COUNT(*) INTO v_open_case_no_due
    FROM public.client_cases
   WHERE client_id = p_client_id
     AND case_status NOT IN ('Completed','Closed')
     AND next_action_due_at IS NULL;
  IF v_open_case_no_due > 0 THEN
    s := s + 3;
    sigs := sigs || jsonb_build_object('label','Open case has no due date','points',3);
  END IF;

  -- Map to level
  IF s >= 50 THEN lvl := 'Critical';
  ELSIF s >= 30 THEN lvl := 'High';
  ELSIF s >= 15 THEN lvl := 'Medium';
  ELSIF s >= 5 THEN lvl := 'Low';
  ELSE lvl := 'Stable';
  END IF;

  UPDATE public.profiles
     SET urgency_score = s,
         urgency_level = lvl,
         last_urgency_calculated_at = now()
   WHERE id = p_client_id;

  RETURN QUERY SELECT s, lvl, sigs;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_client_urgency(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_client_urgency(uuid) TO authenticated, service_role;

-- =====================================================================
-- 3. Bulk recompute used by cron
-- =====================================================================
CREATE OR REPLACE FUNCTION public.recalculate_all_active_client_urgency()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.id
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'client'
     WHERE p.lifecycle_status IS NULL
        OR p.lifecycle_status::text NOT IN ('Completed','Inactive')
  LOOP
    PERFORM public.calculate_client_urgency(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.recalculate_all_active_client_urgency() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_active_client_urgency() TO service_role;

-- =====================================================================
-- 4. Trigger wrappers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_urgency_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  SELECT t.client_id INTO cid FROM public.message_threads t
   WHERE t.id = COALESCE(NEW.thread_id, OLD.thread_id);
  IF cid IS NOT NULL THEN PERFORM public.calculate_client_urgency(cid); END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_urgency_emotion_logs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN PERFORM public.calculate_client_urgency(NEW.user_id); END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_urgency_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_urgency_appointments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_urgency_client_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_urgency_client_cases()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_urgency_reports()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.trg_urgency_client_report_meta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS urgency_messages_trg ON public.messages;
CREATE TRIGGER urgency_messages_trg
  AFTER INSERT OR UPDATE OF read_at ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_messages();

DROP TRIGGER IF EXISTS urgency_emotion_logs_trg ON public.emotion_logs;
CREATE TRIGGER urgency_emotion_logs_trg
  AFTER INSERT ON public.emotion_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_emotion_logs();

DROP TRIGGER IF EXISTS urgency_documents_trg ON public.documents;
CREATE TRIGGER urgency_documents_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_documents();

DROP TRIGGER IF EXISTS urgency_appointments_trg ON public.appointments;
CREATE TRIGGER urgency_appointments_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_appointments();

DROP TRIGGER IF EXISTS urgency_client_payments_trg ON public.client_payments;
CREATE TRIGGER urgency_client_payments_trg
  AFTER INSERT OR UPDATE OF paid, invoice_given OR DELETE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_client_payments();

DROP TRIGGER IF EXISTS urgency_client_cases_trg ON public.client_cases;
CREATE TRIGGER urgency_client_cases_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.client_cases
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_client_cases();

DROP TRIGGER IF EXISTS urgency_reports_trg ON public.reports;
CREATE TRIGGER urgency_reports_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_reports();

DROP TRIGGER IF EXISTS urgency_client_report_meta_trg ON public.client_report_meta;
CREATE TRIGGER urgency_client_report_meta_trg
  AFTER INSERT OR UPDATE ON public.client_report_meta
  FOR EACH ROW EXECUTE FUNCTION public.trg_urgency_client_report_meta();

-- =====================================================================
-- 5. Cron (every 15 minutes, pure SQL — no http needed)
-- =====================================================================
DO $$ BEGIN
  PERFORM cron.unschedule('recalc-client-urgency-15min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'recalc-client-urgency-15min',
  '*/15 * * * *',
  $cron$ SELECT public.recalculate_all_active_client_urgency(); $cron$
);

-- =====================================================================
-- 6. Seed initial scores for all active clients
-- =====================================================================
SELECT public.recalculate_all_active_client_urgency();
