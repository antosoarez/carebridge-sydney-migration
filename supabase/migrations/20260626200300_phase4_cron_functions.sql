-- =====================================================================
-- Phase 4 (Gap J/I): scheduled jobs as SQL functions + pg_cron
-- ---------------------------------------------------------------------
-- These run pure SQL (no external HTTP): they update state and ENQUEUE
-- client-safe rows into automation_outbox; the existing dispatch cron delivers
-- them via Resend + in-app. Implemented as SECURITY DEFINER functions scheduled
-- directly by pg_cron (same pattern as scan_stage_timeouts) — simpler and
-- needs no edge-function token. Idempotent via outbox dedup_key.
-- =====================================================================

-- Gap J: auto-complete appointments that ended > 30 min ago.
CREATE OR REPLACE FUNCTION public.auto_complete_appointments()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT id, client_id, category FROM public.appointments
    WHERE outcome = 'scheduled' AND ends_at < now() - interval '30 minutes'
  LOOP
    -- fires trg_appts_event -> appointment_completed automation
    UPDATE public.appointments SET outcome = 'attended' WHERE id = r.id;
    IF r.category = 'consultation' THEN
      INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, dedup_key)
      VALUES (r.client_id, r.client_id, 'client', ARRAY['email','inapp'], 'post_consultation', 'post_consult:'||r.id::text)
      ON CONFLICT (dedup_key) DO NOTHING;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.auto_complete_appointments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_complete_appointments() TO service_role;

-- Gap G: appointment reminders at ~24h and ~1h before start.
CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; v_when text; v_kind text; v_win text;
BEGIN
  FOR r IN
    SELECT id, client_id, starts_at, category FROM public.appointments
    WHERE outcome = 'scheduled' AND category IN ('consultation','free_followup')
      AND ( (starts_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours')
         OR (starts_at BETWEEN now() + interval '30 minutes' AND now() + interval '90 minutes') )
  LOOP
    v_win := CASE WHEN r.starts_at <= now() + interval '90 minutes' THEN '1h' ELSE '24h' END;
    v_when := to_char(r.starts_at AT TIME ZONE 'Australia/Perth', 'Dy DD Mon FMHH12:MIam');
    v_kind := CASE WHEN r.category = 'free_followup' THEN 'follow-up call' ELSE 'consultation' END;
    INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, vars, dedup_key)
    VALUES (r.client_id, r.client_id, 'client', ARRAY['email','inapp'], 'appointment_reminder',
            jsonb_build_object('when', v_when, 'kind', v_kind), 'appt_remind:'||r.id::text||':'||v_win)
    ON CONFLICT (dedup_key) DO NOTHING;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_appointment_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders() TO service_role;

-- Gap I: member engagement (mood streak + overdue-task escalation).
CREATE OR REPLACE FUNCTION public.member_engagement_check()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
  v_week text := to_char(date_trunc('week', now()), 'IYYY-IW');
  v_today text := to_char(now(), 'YYYY-MM-DD');
  v_tmpl text; v_dedup text;
BEGIN
  -- Low mood on each of the last 3 calendar days -> gentle check-in (weekly dedup)
  FOR r IN
    SELECT user_id FROM public.emotion_logs
    WHERE emotion IN ('sad','overwhelmed','anxious')
      AND created_at >= (now()::date - 2)
      AND user_id IN (SELECT user_id FROM public.user_roles WHERE role = 'client')
    GROUP BY user_id
    HAVING count(DISTINCT (created_at AT TIME ZONE 'Australia/Perth')::date) >= 3
  LOOP
    INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, dedup_key)
    VALUES (r.user_id, r.user_id, 'client', ARRAY['email','inapp'], 'mood_sad_3days', 'mood3:'||r.user_id::text||':'||v_week)
    ON CONFLICT (dedup_key) DO NOTHING;
    n := n + 1;
  END LOOP;

  -- Overdue tasks: escalate by the worst overdue age per client
  FOR r IN
    SELECT client_id, max(now()::date - due_date) AS overdue_days
    FROM public.tasks
    WHERE status <> 'complete' AND due_date IS NOT NULL AND due_date < now()::date
      AND client_id IN (SELECT user_id FROM public.user_roles WHERE role = 'client')
    GROUP BY client_id
  LOOP
    IF r.overdue_days >= 21 THEN v_tmpl := 'reminder_daily_21'; v_dedup := 'od21:'||r.client_id::text||':'||v_today;
    ELSIF r.overdue_days >= 14 THEN v_tmpl := 'reminder_firm_14'; v_dedup := 'od14:'||r.client_id::text||':'||v_week;
    ELSIF r.overdue_days >= 7 THEN v_tmpl := 'reminder_gentle_7'; v_dedup := 'od7:'||r.client_id::text||':'||v_week;
    ELSE CONTINUE; END IF;
    INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, dedup_key)
    VALUES (r.client_id, r.client_id, 'client', ARRAY['email','inapp'], v_tmpl, v_dedup)
    ON CONFLICT (dedup_key) DO NOTHING;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.member_engagement_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_engagement_check() TO service_role;

-- ---------- schedules ----------
DO $$ BEGIN PERFORM cron.unschedule('auto-complete-appointments'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('auto-complete-appointments', '*/15 * * * *', $$SELECT public.auto_complete_appointments();$$);

DO $$ BEGIN PERFORM cron.unschedule('appointment-reminders'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('appointment-reminders', '8,23,38,53 * * * *', $$SELECT public.enqueue_appointment_reminders();$$);

DO $$ BEGIN PERFORM cron.unschedule('member-engagement-check'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('member-engagement-check', '40 * * * *', $$SELECT public.member_engagement_check();$$);
