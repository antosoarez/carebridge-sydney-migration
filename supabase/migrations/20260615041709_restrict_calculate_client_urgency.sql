-- Lock down public.calculate_client_urgency so unauthenticated/cron and
-- advocate callers (or trigger-context invocations) may execute it. Previously
-- any authenticated user could call it directly and learn another client's
-- private urgency signals.

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
  v_open_case_no_due int;
  v_last_activity timestamptz;
  v_uid uuid := auth.uid();
BEGIN
  -- Access control: allow when there is no JWT (cron/service_role), when
  -- invoked transitively from a trigger, or when the caller is an advocate.
  IF v_uid IS NOT NULL
     AND pg_trigger_depth() = 0
     AND NOT public.has_role(v_uid, 'advocate') THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NULL THEN
    RETURN QUERY SELECT 0, 'Stable'::text, '[]'::jsonb;
    RETURN;
  END IF;

  SELECT lifecycle_status::text, activated_at
    INTO v_lifecycle, v_activated
    FROM public.profiles WHERE id = p_client_id;

  SELECT COUNT(*) INTO v_low_mood_count
    FROM public.emotion_logs
    WHERE user_id = p_client_id
      AND created_at >= now() - interval '7 days'
      AND emotion = ANY (ARRAY['sad','overwhelmed','anxious','tired']);
  IF v_low_mood_count >= 3 THEN
    s := s + 30;
    sigs := sigs || jsonb_build_object('label', v_low_mood_count || ' low moods this week', 'points', 30);
  END IF;

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

  IF v_lifecycle = 'Onboarding incomplete'
     AND v_activated IS NOT NULL
     AND v_activated < now() - interval '5 days' THEN
    s := s + 8;
    sigs := sigs || jsonb_build_object('label','Onboarding incomplete 5+ days','points',8);
  END IF;

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

  SELECT COUNT(*) INTO v_open_case_no_due
    FROM public.client_cases
   WHERE client_id = p_client_id
     AND case_status NOT IN ('Completed','Closed')
     AND next_action_due_at IS NULL;
  IF v_open_case_no_due > 0 THEN
    s := s + 3;
    sigs := sigs || jsonb_build_object('label','Open case has no due date','points',3);
  END IF;

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

REVOKE ALL ON FUNCTION public.calculate_client_urgency(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_client_urgency(uuid) TO service_role;
