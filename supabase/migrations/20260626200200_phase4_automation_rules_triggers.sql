-- =====================================================================
-- Phase 4: automation rules + triggers for booking / completion / report
-- ---------------------------------------------------------------------
-- Appointment confirmations + reminders + post-consult + report use the
-- outbox bridge. Templates rendered by dispatch-automation-outbox. Appointment
-- date/time is passed via outbox.vars (not PHI). No HTTP in trigger paths.
-- =====================================================================

-- 1) Consultation completed -> lifecycle "Work in progress" (rule engine).
--    (auto-complete-appointments sets outcome='attended' -> appointment_completed)
INSERT INTO public.automation_rules(slug, name, trigger_kind, trigger_config, priority)
VALUES ('on_consultation_complete', 'Consultation complete → work in progress',
        'appointment_completed', jsonb_build_object('category','consultation'), 35)
ON CONFLICT (slug) DO NOTHING;
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_consultation_complete';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Work in progress'), 1)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;
END $$;

-- 2) Appointment booked -> confirmation notifications + "prepare" task.
CREATE OR REPLACE FUNCTION public.trg_appointment_booked_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_advocate uuid;
  v_when text;
  v_kind text;
BEGIN
  IF NEW.category NOT IN ('consultation','free_followup') THEN
    RETURN NEW;
  END IF;
  SELECT user_id INTO v_advocate FROM public.user_roles WHERE role='advocate' LIMIT 1;
  v_when := to_char(NEW.starts_at AT TIME ZONE 'Australia/Perth', 'Dy DD Mon FMHH12:MIam');
  v_kind := CASE WHEN NEW.category='free_followup' THEN 'follow-up call' ELSE 'consultation' END;

  -- client + advocate confirmation (idempotent via dedup_key)
  INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, vars, dedup_key)
  VALUES (NEW.client_id, NEW.client_id, 'client', ARRAY['email','inapp'], 'appointment_confirmed_client',
          jsonb_build_object('when', v_when, 'kind', v_kind), 'appt_confirm:'||NEW.id||':client')
  ON CONFLICT (dedup_key) DO NOTHING;

  IF v_advocate IS NOT NULL THEN
    INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, vars, dedup_key)
    VALUES (NEW.client_id, v_advocate, 'advocate', ARRAY['email','inapp'], 'appointment_confirmed_advocate',
            jsonb_build_object('when', v_when, 'kind', v_kind), 'appt_confirm:'||NEW.id||':advocate')
    ON CONFLICT (dedup_key) DO NOTHING;

    -- "Prepare" task due the day before
    INSERT INTO public.tasks(client_id, created_by, title, due_date, auto_dedup_key)
    VALUES (NEW.client_id, v_advocate, 'Prepare for '||v_kind, (NEW.starts_at AT TIME ZONE 'Australia/Perth')::date - 1,
            'prep_appt:'||NEW.id::text)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointment_booked_notify ON public.appointments;
CREATE TRIGGER trg_appointment_booked_notify
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_booked_notify();

-- 3) Report task marked complete -> notify client + lifecycle + delayed follow-up nudge.
CREATE OR REPLACE FUNCTION public.trg_task_report_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev_bypass text;
BEGIN
  IF NEW.status = 'complete' AND COALESCE(OLD.status::text,'') <> 'complete'
     AND NEW.auto_dedup_key LIKE 'report_deliver:%' AND NEW.client_id IS NOT NULL THEN

    -- advance lifecycle (bypass the advocate-field guard for this system change)
    v_prev_bypass := current_setting('app.recomputing_progress', true);
    PERFORM set_config('app.recomputing_progress', 'on', true);
    UPDATE public.profiles SET lifecycle_status = 'Report delivered' WHERE id = NEW.client_id;
    PERFORM set_config('app.recomputing_progress', COALESCE(v_prev_bypass,'off'), true);

    -- report ready now
    INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, dedup_key)
    VALUES (NEW.client_id, NEW.client_id, 'client', ARRAY['email','inapp'], 'report_ready',
            'report_ready:'||NEW.id::text)
    ON CONFLICT (dedup_key) DO NOTHING;

    -- gentle follow-up nudge later the same day (delayed via not_before)
    INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, dedup_key, not_before)
    VALUES (NEW.client_id, NEW.client_id, 'client', ARRAY['email','inapp'], 'followup_reminder',
            'followup_nudge:'||NEW.id::text, now() + interval '12 hours')
    ON CONFLICT (dedup_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_report_done ON public.tasks;
CREATE TRIGGER trg_task_report_done
AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_task_report_done();
