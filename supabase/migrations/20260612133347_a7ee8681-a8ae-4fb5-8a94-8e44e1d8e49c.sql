
-- ============================================================
-- PHASE 3: Automatic CRM tasks
-- Event-based triggers + time-based cron creating advocate tasks.
-- All tasks scoped to advocate workflow; client role cannot see (existing tasks RLS).
-- ============================================================

-- Helper: primary advocate id
CREATE OR REPLACE FUNCTION public._primary_advocate_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.user_roles
   WHERE role = 'advocate'
   ORDER BY created_at ASC LIMIT 1
$$;

-- ============================================================
-- (a) Client accepts invite → "Review new client"
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_task_client_activated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE adv uuid;
BEGIN
  IF NEW.activated_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.activated_at IS NOT NULL THEN RETURN NEW; END IF;
  adv := public._primary_advocate_id();
  IF adv IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
  VALUES (
    NEW.id, adv,
    'Review new client: ' || COALESCE(NEW.full_name, NEW.email, 'Unnamed'),
    'to_do',
    (now() + interval '24 hours')::date,
    true,
    'review_client:' || NEW.id::text
  )
  ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
  DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_task_client_activated ON public.profiles;
CREATE TRIGGER trg_auto_task_client_activated
AFTER INSERT OR UPDATE OF activated_at ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_task_client_activated();

-- ============================================================
-- (b) Document uploaded by client → "Review uploaded document"
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_task_doc_uploaded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE adv uuid;
BEGIN
  IF NEW.uploaded_by IS NULL THEN RETURN NEW; END IF;
  IF NOT public.has_role(NEW.uploaded_by, 'client') THEN RETURN NEW; END IF;
  adv := public._primary_advocate_id();
  IF adv IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
  VALUES (
    COALESCE(NEW.client_id, NEW.uploaded_by), adv,
    'Review uploaded document: ' || COALESCE(NEW.name, 'document'),
    'to_do',
    (now() + interval '48 hours')::date,
    false,
    'review_doc:' || NEW.id::text
  )
  ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
  DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_task_doc_uploaded ON public.documents;
CREATE TRIGGER trg_auto_task_doc_uploaded
AFTER INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_task_doc_uploaded();

-- ============================================================
-- (c) Appointment created → "Prepare appointment" (day before)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_task_appt_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE adv uuid;
BEGIN
  IF NEW.starts_at IS NULL THEN RETURN NEW; END IF;
  adv := public._primary_advocate_id();
  IF adv IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
  VALUES (
    NEW.client_id, adv,
    'Prepare appointment: ' || COALESCE(NEW.title, 'Appointment')
      || ' (' || to_char(NEW.starts_at, 'DD Mon') || ')',
    'to_do',
    (NEW.starts_at - interval '24 hours')::date,
    false,
    'prep_appt:' || NEW.id::text
  )
  ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
  DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_task_appt_created ON public.appointments;
CREATE TRIGGER trg_auto_task_appt_created
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_task_appt_created();

-- ============================================================
-- (d) Appointment attended → "Send follow-up summary"
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_task_appt_attended()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE adv uuid;
BEGIN
  IF NEW.outcome <> 'attended' THEN RETURN NEW; END IF;
  IF OLD.outcome = 'attended' THEN RETURN NEW; END IF;
  adv := public._primary_advocate_id();
  IF adv IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
  VALUES (
    NEW.client_id, adv,
    'Send follow-up summary: ' || COALESCE(NEW.title, 'Appointment'),
    'to_do',
    (now() + interval '48 hours')::date,
    false,
    'followup_appt:' || NEW.id::text
  )
  ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
  DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_task_appt_attended ON public.appointments;
CREATE TRIGGER trg_auto_task_appt_attended
AFTER UPDATE OF outcome ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_task_appt_attended();

-- ============================================================
-- (e) Report comment from client → "Review report feedback"
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_auto_task_report_feedback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE adv uuid; cid uuid; cname text;
BEGIN
  IF NEW.author_role <> 'client' THEN RETURN NEW; END IF;
  SELECT client_id INTO cid FROM public.reports WHERE id = NEW.report_id;
  IF cid IS NULL THEN RETURN NEW; END IF;
  adv := public._primary_advocate_id();
  IF adv IS NULL THEN RETURN NEW; END IF;
  SELECT full_name INTO cname FROM public.profiles WHERE id = cid;

  INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
  VALUES (
    cid, adv,
    'Review report feedback from ' || COALESCE(cname, 'client'),
    'to_do',
    (now() + interval '24 hours')::date,
    true,
    'report_feedback:' || NEW.id::text
  )
  ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
  DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_task_report_feedback ON public.report_comments;
CREATE TRIGGER trg_auto_task_report_feedback
AFTER INSERT ON public.report_comments
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_task_report_feedback();

-- ============================================================
-- TIME-BASED: process_auto_advocate_tasks()
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_auto_advocate_tasks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  adv uuid := public._primary_advocate_id();
  r record;
  n int := 0;
  dedup text;
  cname text;
BEGIN
  IF adv IS NULL THEN RETURN 0; END IF;

  -- (a) Unread client messages > 24h, one task per thread
  FOR r IN
    SELECT DISTINCT t.id AS thread_id, t.client_id
      FROM public.messages m
      JOIN public.message_threads t ON t.id = m.thread_id
     WHERE m.sender_role = 'client'
       AND m.read_at IS NULL
       AND m.created_at < now() - interval '24 hours'
  LOOP
    dedup := 'reply_client:' || r.thread_id::text;
    SELECT full_name INTO cname FROM public.profiles WHERE id = r.client_id;
    BEGIN
      INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
      VALUES (r.client_id, adv,
              'Reply to client: ' || COALESCE(cname,'client'),
              'to_do', CURRENT_DATE, true, dedup)
      ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
      DO NOTHING;
      n := n + 1;
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;

  -- (b) 3+ low-mood emotion logs in 7 days, weekly dedup
  FOR r IN
    SELECT user_id, COUNT(*) AS c
      FROM public.emotion_logs
     WHERE created_at >= now() - interval '7 days'
       AND emotion = ANY (ARRAY['sad','overwhelmed','anxious','tired'])
       AND user_id IS NOT NULL
     GROUP BY user_id
    HAVING COUNT(*) >= 3
  LOOP
    dedup := 'mood_checkin:' || r.user_id::text || ':' || to_char(date_trunc('week', now()), 'IYYY-IW');
    SELECT full_name INTO cname FROM public.profiles WHERE id = r.user_id;
    BEGIN
      INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
      VALUES (r.user_id, adv,
              'Consider gentle check-in: ' || COALESCE(cname,'client'),
              'to_do', CURRENT_DATE, true, dedup)
      ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
      DO NOTHING;
      n := n + 1;
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;

  -- (c) Payment overdue > 7 days from invoice
  FOR r IN
    SELECT id, client_id FROM public.client_payments
     WHERE paid = false
       AND invoice_given = true
       AND COALESCE(invoice_given_at, created_at) < now() - interval '7 days'
  LOOP
    dedup := 'payment_followup:' || r.id::text;
    SELECT full_name INTO cname FROM public.profiles WHERE id = r.client_id;
    BEGIN
      INSERT INTO public.tasks (client_id, created_by, title, status, due_date, is_priority, auto_dedup_key)
      VALUES (r.client_id, adv,
              'Follow up on payment: ' || COALESCE(cname,'client'),
              'to_do', CURRENT_DATE, false, dedup)
      ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
      DO NOTHING;
      n := n + 1;
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_auto_advocate_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._primary_advocate_id() FROM PUBLIC, anon, authenticated;

-- Schedule hourly (plain SQL, no http needed)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-advocate-tasks-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-advocate-tasks-hourly',
  '7 * * * *',
  $$SELECT public.process_auto_advocate_tasks();$$
);
