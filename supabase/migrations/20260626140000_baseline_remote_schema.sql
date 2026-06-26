--
-- PostgreSQL database dump
--

\restrict ueKryOHttGE22DkNNEv4Gp8WaEx6an6my1Lc3pAWeYginengkt1uC2mr8BYTCq9

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."app_role" AS ENUM (
    'advocate',
    'client'
);


--
-- Name: client_lifecycle_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."client_lifecycle_status" AS ENUM (
    'New enquiry',
    'Invited',
    'Invite accepted',
    'Onboarding incomplete',
    'Onboarding complete',
    'Active',
    'Waiting on client',
    'Waiting on clinic',
    'Appointment upcoming',
    'Report in progress',
    'Payment outstanding',
    'Follow-up required',
    'Completed',
    'Ongoing support',
    'Inactive'
);


--
-- Name: client_payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."client_payment_status" AS ENUM (
    'unpaid',
    'half_paid',
    'full_paid'
);


--
-- Name: client_report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."client_report_status" AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'updating',
    'finished'
);


--
-- Name: client_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."client_tier" AS ENUM (
    'tier_1',
    'tier_2',
    'tier_3'
);


--
-- Name: document_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."document_status" AS ENUM (
    'pending_review',
    'triaged',
    'archived'
);


--
-- Name: document_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."document_visibility" AS ENUM (
    'shared',
    'advocate_private'
);


--
-- Name: fee_model; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."fee_model" AS ENUM (
    'tier_50_50',
    'custom'
);


--
-- Name: inbound_message_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."inbound_message_status" AS ENUM (
    'new',
    'read',
    'archived'
);


--
-- Name: payment_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."payment_kind" AS ENUM (
    'deposit',
    'final',
    'custom'
);


--
-- Name: report_review_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."report_review_status" AS ENUM (
    'draft',
    'shared_for_review',
    'agreed'
);


--
-- Name: report_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."report_stage" AS ENUM (
    'draft',
    'v1',
    'v2',
    'v3',
    'finalised',
    'updated'
);


--
-- Name: report_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."report_visibility" AS ENUM (
    'private',
    'shared'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."task_status" AS ENUM (
    'to_do',
    'complete'
);


--
-- Name: template_audience; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."template_audience" AS ENUM (
    'patient',
    'clinic',
    'both'
);


--
-- Name: _primary_advocate_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."_primary_advocate_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT user_id FROM public.user_roles
   WHERE role = 'advocate'
   ORDER BY created_at ASC LIMIT 1
$$;


--
-- Name: admin_delete_client("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_delete_client"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT public.has_role(_user_id, 'client') THEN
    RAISE EXCEPTION 'Target is not a client';
  END IF;

  DELETE FROM public.payment_note_dismissals WHERE client_id = _user_id;
  DELETE FROM public.payment_reminders_log   WHERE client_id = _user_id;
  DELETE FROM public.client_payments         WHERE client_id = _user_id;
  DELETE FROM public.client_fee_arrangements WHERE client_id = _user_id;
  DELETE FROM public.tasks            WHERE client_id = _user_id;
  DELETE FROM public.appointments     WHERE client_id = _user_id;
  DELETE FROM public.documents        WHERE client_id = _user_id OR uploaded_by = _user_id;
  DELETE FROM public.emotion_logs     WHERE user_id   = _user_id;
  DELETE FROM public.mfa_recovery_codes WHERE user_id = _user_id;
  DELETE FROM public.trusted_devices  WHERE user_id   = _user_id;
  DELETE FROM public.user_roles       WHERE user_id   = _user_id;
  DELETE FROM public.profiles         WHERE id        = _user_id;
END;
$$;


--
-- Name: agree_report("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."agree_report"("_report_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE r public.reports%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = _report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> r.client_id THEN
    RAISE EXCEPTION 'Only the client can confirm this report';
  END IF;
  IF r.status <> 'shared_for_review' THEN
    RAISE EXCEPTION 'Report is not awaiting your review';
  END IF;
  UPDATE public.reports
    SET status = 'agreed',
        client_agreed_at = now()
    WHERE id = _report_id;
END;
$$;


--
-- Name: availability_requests_status_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."availability_requests_status_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  is_advocate boolean := public.has_role(auth.uid(), 'advocate');
  is_client boolean := (auth.uid() IS NOT NULL AND auth.uid() = NEW.client_id);
  ok boolean := false;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND is_advocate THEN
    ok := true;
  ELSIF OLD.status = 'draft' AND NEW.status = 'sent_to_client' AND is_advocate THEN
    ok := true;
  ELSIF OLD.status = 'sent_to_client' AND NEW.status = 'waiting_for_client' AND (is_advocate OR is_client) THEN
    ok := true;
  ELSIF OLD.status = 'waiting_for_client' AND NEW.status = 'client_responded' AND is_client THEN
    ok := true;
  ELSIF OLD.status = 'client_responded' AND NEW.status = 'ready_to_book' AND is_advocate THEN
    ok := true;
  ELSIF OLD.status = 'ready_to_book' AND NEW.status = 'clinic_contacted' AND is_advocate THEN
    IF EXISTS (SELECT 1 FROM public.clinic_contact_logs WHERE availability_request_id = NEW.id) THEN
      ok := true;
    ELSE
      RAISE EXCEPTION 'Cannot move to clinic_contacted without at least one clinic_contact_logs entry';
    END IF;
  ELSIF OLD.status = 'clinic_contacted' AND NEW.status = 'appointment_confirmed' AND is_advocate THEN
    IF EXISTS (SELECT 1 FROM public.appointments WHERE availability_request_id = NEW.id) THEN
      ok := true;
    ELSE
      RAISE EXCEPTION 'Cannot move to appointment_confirmed without a linked appointment';
    END IF;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid availability_request status transition: % -> %', OLD.status, NEW.status
      USING HINT = 'Check role permissions and the documented transition table.';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: availability_requests_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."availability_requests_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.has_role(auth.uid(), 'advocate') THEN
      NEW.advocate_id := auth.uid();
    END IF;
  END IF;
  NEW.updated_at := now();
  IF NEW.status = 'sent_to_client' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  IF NEW.status = 'client_responded' AND NEW.client_responded_at IS NULL THEN
    NEW.client_responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: bump_client_progress("uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."bump_client_progress"("_client_id" "uuid", "_delta" integer, "_cap" integer DEFAULT 75) RETURNS smallint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_val smallint;
  new_val int;
  caller uuid := auth.uid();
  is_advocate boolean := public.has_role(caller, 'advocate');
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_advocate AND caller <> _client_id THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT client_progress INTO current_val FROM public.profiles WHERE id = _client_id FOR UPDATE;
  IF current_val IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  new_val := current_val + _delta;
  IF new_val < 0 THEN new_val := 0; END IF;
  IF new_val > 100 THEN new_val := 100; END IF;

  -- Client-action cap: never push above _cap when called by client
  IF NOT is_advocate AND new_val > _cap THEN
    new_val := GREATEST(current_val, LEAST(_cap, new_val));
    IF current_val >= _cap THEN
      new_val := current_val;
    END IF;
  END IF;

  UPDATE public.profiles SET client_progress = new_val WHERE id = _client_id;
  RETURN new_val::smallint;
END;
$$;


--
-- Name: bump_thread_last_message_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."bump_thread_last_message_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.message_threads
    SET last_message_at = NEW.created_at
    WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;


--
-- Name: calculate_client_urgency("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."calculate_client_urgency"("p_client_id" "uuid") RETURNS TABLE("score" integer, "level" "text", "signals" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: client_availability_preferences_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."client_availability_preferences_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: client_cases_auto_close(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."client_cases_auto_close"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.case_status IN ('Completed','Closed') THEN
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: client_cases_sync_next_action_task(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."client_cases_sync_next_action_task"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  dedup text := 'case_action:' || NEW.id::text;
  task_title text;
  closed boolean := NEW.case_status IN ('Completed','Closed');
  action_cleared boolean;
  action_changed boolean;
BEGIN
  action_cleared := (NEW.next_action IS NULL OR NEW.next_action_due_at IS NULL);

  IF TG_OP = 'UPDATE' THEN
    action_changed := (
      OLD.next_action IS DISTINCT FROM NEW.next_action OR
      OLD.next_action_due_at IS DISTINCT FROM NEW.next_action_due_at OR
      OLD.case_title IS DISTINCT FROM NEW.case_title OR
      OLD.case_status IS DISTINCT FROM NEW.case_status
    );
  ELSE
    action_changed := true;
  END IF;

  IF NOT action_changed THEN
    RETURN NEW;
  END IF;

  -- Close any existing open task for this case so the unique partial index
  -- doesn't block creation of a fresh one.
  UPDATE public.tasks
     SET status = 'complete', completed_at = COALESCE(completed_at, now())
   WHERE auto_dedup_key = dedup AND status <> 'complete';

  IF closed OR action_cleared THEN
    RETURN NEW;
  END IF;

  task_title := NEW.case_title || ': ' || NEW.next_action;

  INSERT INTO public.tasks (
    client_id, created_by, title,
    status, due_date, due_time,
    is_priority, auto_dedup_key
  ) VALUES (
    NEW.client_id, NEW.created_by, task_title,
    'to_do', NEW.next_action_due_at::date, NEW.next_action_due_at,
    false, dedup
  );

  RETURN NEW;
END;
$$;


--
-- Name: clinic_contact_logs_stamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."clinic_contact_logs_stamp"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.advocate_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: count_my_active_recovery_codes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."count_my_active_recovery_codes"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COUNT(*)::int
    FROM public.mfa_recovery_codes
   WHERE user_id = auth.uid()
     AND used_at IS NULL
$$;


--
-- Name: create_overdue_task_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."create_overdue_task_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r record;
  created_count int := 0;
  days_overdue int;
  dedup text;
  prefix text;
  new_title text;
BEGIN
  FOR r IN
    SELECT t.id, t.client_id, t.title, t.created_by, t.due_date,
           (CURRENT_DATE - t.due_date)::int AS days_late
      FROM public.tasks t
      JOIN public.user_roles ur
        ON ur.user_id = t.client_id AND ur.role = 'advocate'
     WHERE t.status <> 'complete'
       AND t.due_date IS NOT NULL
       AND t.due_date < CURRENT_DATE
       AND (t.auto_dedup_key IS NULL OR t.auto_dedup_key NOT LIKE 'overdue_%')
  LOOP
    days_overdue := r.days_late;

    IF days_overdue >= 14 THEN
      dedup := 'overdue_14d:' || r.id::text;
      prefix := '⚠️ Overdue 14 days: ';
    ELSIF days_overdue >= 7 THEN
      dedup := 'overdue_7d:' || r.id::text;
      prefix := '⏰ Overdue 7 days: ';
    ELSIF days_overdue >= 3 THEN
      dedup := 'overdue_3d:' || r.id::text;
      prefix := '⏰ Overdue 3 days: ';
    ELSE
      CONTINUE;
    END IF;

    -- Skip if a reminder at this level already exists (open or completed)
    IF EXISTS (SELECT 1 FROM public.tasks WHERE auto_dedup_key = dedup) THEN
      CONTINUE;
    END IF;

    new_title := prefix || r.title;

    BEGIN
      INSERT INTO public.tasks (
        client_id, created_by, title, status,
        due_date, is_priority, auto_dedup_key
      ) VALUES (
        r.client_id, COALESCE(r.created_by, r.client_id), new_title, 'to_do',
        CURRENT_DATE, true, dedup
      );
      created_count := created_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- race: another run created the same dedup; ignore
      NULL;
    END;
  END LOOP;

  RETURN created_count;
END;
$$;


--
-- Name: create_task_on_new_enquiry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."create_task_on_new_enquiry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  advocate_id uuid;
BEGIN
  IF NEW.enquiry_status <> 'New' THEN
    RETURN NEW;
  END IF;

  -- Pick the primary advocate (the single practitioner pattern used elsewhere)
  SELECT user_id INTO advocate_id
    FROM public.user_roles
    WHERE role = 'advocate'
    ORDER BY created_at ASC
    LIMIT 1;

  IF advocate_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- tasks.client_id is NOT NULL, so we file enquiry-reply tasks under the
  -- advocate's own profile id (no client exists yet for this enquiry).
  INSERT INTO public.tasks (
    client_id, created_by, title, description,
    status, due_date, is_priority, auto_dedup_key
  )
  VALUES (
    advocate_id, advocate_id,
    'Reply to new enquiry: ' || COALESCE(NEW.name, 'Unknown'),
    COALESCE('From: ' || NEW.email, '') ||
      CASE WHEN NEW.phone IS NOT NULL THEN E'\nPhone: ' || NEW.phone ELSE '' END ||
      CASE WHEN NEW.message IS NOT NULL THEN E'\n\n' || NEW.message ELSE '' END,
    'to_do',
    (now() + interval '24 hours')::date,
    true,
    'enquiry_reply:' || NEW.id::text
  )
  ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
  DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: delete_email("text", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;


--
-- Name: enqueue_email("text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;


--
-- Name: ensure_message_thread_for_client("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ensure_message_thread_for_client"("_client_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  _advocate_id uuid;
begin
  if not public.has_role(_client_id, 'client'::public.app_role) then
    return;
  end if;

  select user_id into _advocate_id
  from public.user_roles
  where role = 'advocate'::public.app_role
  order by created_at asc
  limit 1;

  if _advocate_id is null then
    return;
  end if;

  insert into public.client_cases (
    client_id,
    case_title,
    service_type,
    case_status,
    created_by
  )
  select
    _client_id,
    'CareBridge advocacy support',
    'Ongoing advocacy support',
    'New',
    _advocate_id
  where not exists (
    select 1 from public.client_cases where client_id = _client_id
  );

  insert into public.message_threads (client_id, advocate_id)
  values (_client_id, _advocate_id)
  on conflict (client_id, advocate_id) do nothing;
end;
$$;


--
-- Name: find_my_trusted_device("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."find_my_trusted_device"("_token_hash" "text") RETURNS TABLE("id" "uuid", "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT td.id, td.expires_at
    FROM public.trusted_devices td
   WHERE td.user_id = auth.uid()
     AND td.token_hash = _token_hash
   LIMIT 1
$$;


--
-- Name: get_advocate_dashboard_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_advocate_dashboard_counts"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT jsonb_build_object(
    'new_enquiries', (
      SELECT COUNT(*)::int FROM public.inbound_messages WHERE enquiry_status = 'New'
    ),
    'invites_pending', (
      SELECT COUNT(*)::int FROM public.profiles WHERE lifecycle_status::text = 'Invited'
    ),
    'onboarding_incomplete', (
      SELECT COUNT(*)::int FROM public.profiles WHERE lifecycle_status::text = 'Onboarding incomplete'
    ),
    'active_clients', (
      SELECT COUNT(*)::int FROM public.profiles
       WHERE lifecycle_status::text IN ('Active','Ongoing support')
    ),
    'waiting_on_client', (
      SELECT COUNT(*)::int FROM public.profiles WHERE lifecycle_status::text = 'Waiting on client'
    ),
    'waiting_on_clinic', (
      SELECT COUNT(*)::int FROM public.profiles WHERE lifecycle_status::text = 'Waiting on clinic'
    ),
    'appointments_this_week', (
      SELECT COUNT(*)::int FROM public.appointments
       WHERE starts_at BETWEEN now() AND now() + interval '7 days'
         AND outcome = 'scheduled'
    ),
    'payment_outstanding', (
      SELECT COUNT(DISTINCT client_id)::int FROM (
        SELECT id AS client_id FROM public.profiles WHERE lifecycle_status::text = 'Payment outstanding'
        UNION
        SELECT client_id FROM public.client_payments WHERE paid = false AND invoice_given = true
      ) x
    ),
    'overdue_tasks', (
      SELECT COUNT(*)::int FROM public.tasks
       WHERE status <> 'complete' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
    ),
    'unread_messages', (
      SELECT COUNT(DISTINCT t.id)::int
        FROM public.message_threads t
        JOIN public.messages m ON m.thread_id = t.id
       WHERE m.sender_role = 'client' AND m.read_at IS NULL
    ),
    'reports_in_progress', (
      SELECT COUNT(*)::int FROM public.reports WHERE status <> 'agreed'
    ),
    'feedback_to_review', (
      SELECT COUNT(*)::int FROM public.reports
       WHERE client_feedback IS NOT NULL AND client_agreed_at IS NULL
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_advocate_notes("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_advocate_notes"("_request_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  notes text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT advocate_notes INTO notes
    FROM public.availability_requests
   WHERE id = _request_id;
  RETURN notes;
END;
$$;


--
-- Name: get_appointment_private_notes_map(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_appointment_private_notes_map"() RETURNS TABLE("id" "uuid", "advocate_private_notes" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT a.id, a.advocate_private_notes
      FROM public.appointments a
     WHERE a.advocate_private_notes IS NOT NULL;
END;
$$;


--
-- Name: get_client_crm_summary("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_client_crm_summary"("p_client_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result jsonb;
  v_active_case jsonb;
  v_last_message timestamptz;
  v_last_document timestamptz;
  v_next_appt jsonb;
  v_payment_state text;
  v_recent_moods jsonb;
  v_signals jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Most recent open case
  SELECT jsonb_build_object(
    'id', id, 'title', case_title, 'status', case_status,
    'next_action', next_action, 'next_action_due_at', next_action_due_at,
    'payment_state', payment_state
  )
    INTO v_active_case
    FROM public.client_cases
   WHERE client_id = p_client_id
     AND case_status NOT IN ('Completed','Closed')
   ORDER BY opened_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  -- Last client-sent message
  SELECT MAX(m.created_at) INTO v_last_message
    FROM public.messages m
    JOIN public.message_threads t ON t.id = m.thread_id
   WHERE t.client_id = p_client_id AND m.sender_role = 'client';

  -- Last document uploaded by client
  SELECT MAX(created_at) INTO v_last_document
    FROM public.documents
   WHERE uploaded_by = p_client_id;

  -- Next upcoming appointment
  SELECT jsonb_build_object('id', id, 'title', title, 'starts_at', starts_at, 'location', location)
    INTO v_next_appt
    FROM public.appointments
   WHERE client_id = p_client_id
     AND starts_at > now()
     AND outcome = 'scheduled'
   ORDER BY starts_at ASC
   LIMIT 1;

  -- Payment state (case > client_payments fallback)
  IF v_active_case IS NOT NULL AND (v_active_case->>'payment_state') IS NOT NULL THEN
    v_payment_state := v_active_case->>'payment_state';
  ELSE
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM public.client_payments
                    WHERE client_id = p_client_id AND paid = false AND invoice_given = true
                      AND COALESCE(invoice_given_at, created_at) < now() - interval '7 days')
        THEN 'Overdue'
      WHEN EXISTS (SELECT 1 FROM public.client_payments
                    WHERE client_id = p_client_id AND paid = false AND invoice_given = true)
        THEN 'Unpaid'
      WHEN EXISTS (SELECT 1 FROM public.client_payments WHERE client_id = p_client_id AND paid = true)
        THEN 'Paid'
      ELSE NULL
    END INTO v_payment_state;
  END IF;

  -- Last 3 emotion logs
  SELECT COALESCE(jsonb_agg(jsonb_build_object('emotion', emotion, 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_recent_moods
    FROM (
      SELECT emotion, created_at FROM public.emotion_logs
       WHERE user_id = p_client_id
       ORDER BY created_at DESC LIMIT 3
    ) m;

  -- Active attention signals
  SELECT COALESCE(jsonb_agg(jsonb_build_object('signal_type', signal_type) ORDER BY noted_at NULLS FIRST), '[]'::jsonb)
    INTO v_signals
    FROM public.attention_signals
   WHERE client_id = p_client_id
     AND auto_resolved_at IS NULL
     AND noted_at IS NULL;

  SELECT jsonb_build_object(
    'active_case', v_active_case,
    'payment_state', v_payment_state,
    'report_status', (SELECT report_status FROM public.profiles WHERE id = p_client_id),
    'last_message_at', v_last_message,
    'last_document_at', v_last_document,
    'next_appointment', v_next_appt,
    'recent_moods', v_recent_moods,
    'active_signals', v_signals,
    'internal_notes_preview', (
      SELECT CASE WHEN body IS NULL THEN NULL
                  WHEN length(body) > 120 THEN substr(body, 1, 120) || '…'
                  ELSE body END
        FROM public.client_internal_notes WHERE client_id = p_client_id
    )
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_client_emotion_summary("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_client_emotion_summary"("_client_id" "uuid", "_days" integer DEFAULT 14) RETURNS TABLE("day" "date", "emotion" "text", "count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT (el.created_at AT TIME ZONE 'UTC')::date AS day,
           el.emotion,
           COUNT(*)::int AS count
      FROM public.emotion_logs el
     WHERE el.user_id = _client_id
       AND el.created_at >= now() - make_interval(days => _days)
     GROUP BY 1, 2;
END;
$$;


--
-- Name: get_my_advocate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_my_advocate"() RETURNS TABLE("id" "uuid", "full_name" "text", "email" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email
      FROM public.message_threads t
      JOIN public.profiles p ON p.id = t.advocate_id
     WHERE t.client_id = uid
     LIMIT 1;
END;
$$;


--
-- Name: get_recent_low_mood_rows(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_recent_low_mood_rows"("_days" integer DEFAULT 7) RETURNS TABLE("user_id" "uuid", "emotion" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
    SELECT el.user_id, el.emotion, el.created_at
      FROM public.emotion_logs el
     WHERE el.user_id IS NOT NULL
       AND el.created_at >= now() - make_interval(days => _days)
       AND el.emotion = ANY (ARRAY['sad','overwhelmed','anxious']);
END;
$$;


--
-- Name: guard_profile_advocate_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."guard_profile_advocate_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF current_setting('app.recomputing_progress', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.report_status IS DISTINCT FROM OLD.report_status
       OR NEW.client_colour IS DISTINCT FROM OLD.client_colour
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.client_progress IS DISTINCT FROM OLD.client_progress
       OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, client_colour, payment_status, client_progress, or lifecycle_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: has_role("uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


--
-- Name: invalidate_user_auth_tokens("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."invalidate_user_auth_tokens"("_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  UPDATE auth.users
  SET confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change_token_current = ''
  WHERE id = _user_id;
END;
$$;


--
-- Name: list_my_trusted_devices(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_my_trusted_devices"() RETURNS TABLE("id" "uuid", "label" "text", "expires_at" timestamp with time zone, "last_used_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT td.id, td.label, td.expires_at, td.last_used_at, td.created_at
    FROM public.trusted_devices td
   WHERE td.user_id = auth.uid()
   ORDER BY td.last_used_at DESC
$$;


--
-- Name: log_task_status_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."log_task_status_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'complete' THEN
      INSERT INTO public.task_status_events (task_id, client_id, from_status, to_status, title_snapshot, at)
      VALUES (NEW.id, NEW.client_id, NULL, NEW.status, NEW.title, COALESCE(NEW.completed_at, now()));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_status_events (task_id, client_id, from_status, to_status, title_snapshot, at)
    VALUES (NEW.id, NEW.client_id, OLD.status, NEW.status, NEW.title,
            CASE WHEN NEW.status = 'complete' THEN COALESCE(NEW.completed_at, now()) ELSE now() END);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: mark_all_notifications_read(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mark_all_notifications_read"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


--
-- Name: mark_notification_read("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mark_notification_read"("_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.notifications
    SET read_at = COALESCE(read_at, now())
    WHERE id = _id AND user_id = auth.uid();
END;
$$;


--
-- Name: mark_thread_read("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."mark_thread_read"("_thread_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
$$;


--
-- Name: move_to_dlq("text", "text", bigint, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;


--
-- Name: process_auto_advocate_tasks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."process_auto_advocate_tasks"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


--
-- Name: read_email_batch("text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) RETURNS TABLE("msg_id" bigint, "read_ct" integer, "message" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;


--
-- Name: recalculate_all_active_client_urgency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."recalculate_all_active_client_urgency"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: recompute_client_progress("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."recompute_client_progress"("_client_id" "uuid") RETURNS smallint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  attended_pts int := 0;
  missed_pts int := 0;
  docs_pts int := 0;
  tasks_pts int := 0;
  total int := 0;
BEGIN
  IF _client_id IS NULL THEN RETURN 0; END IF;

  -- Mark this transaction as a legitimate recompute so the profile guard
  -- knows to allow the client_progress write below. Scoped to this tx only.
  PERFORM set_config('app.recomputing_progress', 'on', true);

  SELECT COALESCE(COUNT(*),0) * 25 INTO attended_pts
    FROM public.appointments WHERE client_id = _client_id AND outcome = 'attended';

  SELECT COALESCE(COUNT(*),0) * 10 INTO missed_pts
    FROM public.appointments WHERE client_id = _client_id AND outcome = 'cancelled_missed';

  SELECT COALESCE(COUNT(*),0) * 30 INTO docs_pts
    FROM public.documents WHERE uploaded_by = _client_id;

  SELECT COALESCE(COUNT(*),0) * 10 INTO tasks_pts
    FROM public.tasks WHERE client_id = _client_id AND status = 'complete';

  total := attended_pts - missed_pts + docs_pts + tasks_pts;
  IF total < 0 THEN total := 0; END IF;
  IF total > 100 THEN total := 100; END IF;

  UPDATE public.profiles SET client_progress = total::smallint WHERE id = _client_id;

  -- Clear the flag so subsequent statements in the same tx are guarded normally.
  PERFORM set_config('app.recomputing_progress', '', true);

  RETURN total::smallint;
END;
$$;


--
-- Name: reset_report_progress("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."reset_report_progress"("_client_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  INSERT INTO public.client_report_meta (client_id, report_progress)
    VALUES (_client_id, 0)
    ON CONFLICT (client_id) DO UPDATE SET report_progress = 0, updated_at = now();
  UPDATE public.profiles SET report_status = 'updating' WHERE id = _client_id;
END;
$$;


--
-- Name: revert_report_to_draft("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."revert_report_to_draft"("_report_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.reports
    SET status = 'draft',
        client_agreed_at = NULL
    WHERE id = _report_id;
END;
$$;


--
-- Name: send_back_report("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."send_back_report"("_report_id" "uuid", "_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE r public.reports%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = _report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> r.client_id THEN
    RAISE EXCEPTION 'Only the client can send this back';
  END IF;
  IF r.status <> 'shared_for_review' THEN
    RAISE EXCEPTION 'Report is not awaiting your review';
  END IF;
  UPDATE public.reports
    SET client_feedback = _note,
        client_agreed_at = NULL
    WHERE id = _report_id;
END;
$$;


--
-- Name: set_message_sender_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_message_sender_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: set_report_comment_author_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_report_comment_author_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.author_id := auth.uid();
  IF public.has_role(auth.uid(), 'advocate') THEN
    NEW.author_role := 'advocate';
  ELSIF public.has_role(auth.uid(), 'client') THEN
    NEW.author_role := 'client';
  ELSE
    RAISE EXCEPTION 'No valid role for commenter';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_report_stage_visibility("uuid", "public"."report_stage", "public"."report_visibility"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_report_stage_visibility"("_report_id" "uuid", "_stage" "public"."report_stage", "_visibility" "public"."report_visibility") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.reports
    SET stage = _stage,
        visibility = _visibility,
        status = CASE
          WHEN _visibility = 'shared' AND status = 'draft' THEN 'shared_for_review'::report_review_status
          WHEN _visibility = 'private' AND status = 'shared_for_review' THEN 'draft'::report_review_status
          ELSE status
        END,
        shared_at = CASE
          WHEN _visibility = 'shared' AND shared_at IS NULL THEN now()
          ELSE shared_at
        END
    WHERE id = _report_id;
END; $$;


--
-- Name: share_report_for_review("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."share_report_for_review"("_report_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.reports
    SET status = 'shared_for_review',
        shared_at = COALESCE(shared_at, now()),
        client_agreed_at = NULL
    WHERE id = _report_id;
END;
$$;


--
-- Name: touch_client_cases_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_client_cases_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: touch_client_internal_notes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_client_internal_notes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;


--
-- Name: touch_client_navigation_intake(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_client_navigation_intake"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: touch_client_report_meta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_client_report_meta"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: touch_inbound_messages_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_inbound_messages_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: touch_payment_row(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_payment_row"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  -- auto-stamp dates
  IF TG_TABLE_NAME = 'client_payments' THEN
    IF NEW.invoice_given AND NEW.invoice_given_at IS NULL THEN
      NEW.invoice_given_at := now();
    END IF;
    IF NOT NEW.invoice_given THEN
      NEW.invoice_given_at := NULL;
    END IF;
    IF NEW.paid AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
    IF NOT NEW.paid THEN
      NEW.paid_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: touch_reports_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_reports_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: touch_task_subtasks_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_task_subtasks_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_auto_task_appt_attended(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_auto_task_appt_attended"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


--
-- Name: trg_auto_task_appt_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_auto_task_appt_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


--
-- Name: trg_auto_task_client_activated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_auto_task_client_activated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


--
-- Name: trg_auto_task_doc_uploaded(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_auto_task_doc_uploaded"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


--
-- Name: trg_auto_task_report_feedback(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_auto_task_report_feedback"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


--
-- Name: trg_profile_activation_thread(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_profile_activation_thread"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.has_role(NEW.id, 'client'::public.app_role)
     and (
       (NEW.activated_at is not null and (TG_OP = 'INSERT' or OLD.activated_at is null))
       or (NEW.onboarding_completed_at is not null and (TG_OP = 'INSERT' or OLD.onboarding_completed_at is null))
       or (
         NEW.lifecycle_status in (
           'Onboarding complete'::public.client_lifecycle_status,
           'Active'::public.client_lifecycle_status
         )
         and (TG_OP = 'INSERT' or OLD.lifecycle_status is distinct from NEW.lifecycle_status)
       )
     ) then
    perform public.ensure_message_thread_for_client(NEW.id);
  end if;

  return NEW;
end;
$$;


--
-- Name: trg_recompute_appointments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_recompute_appointments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_client_progress(OLD.client_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_client_progress(NEW.client_id);
    IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      PERFORM public.recompute_client_progress(OLD.client_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;


--
-- Name: trg_recompute_documents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_recompute_documents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.uploaded_by IS NOT NULL THEN
      PERFORM public.recompute_client_progress(OLD.uploaded_by);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.uploaded_by IS NOT NULL THEN
      PERFORM public.recompute_client_progress(NEW.uploaded_by);
    END IF;
    RETURN NEW;
  END IF;
END $$;


--
-- Name: trg_recompute_tasks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_recompute_tasks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_client_progress(OLD.client_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_client_progress(NEW.client_id);
    IF TG_OP = 'UPDATE' AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
      PERFORM public.recompute_client_progress(OLD.client_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;


--
-- Name: trg_urgency_appointments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_appointments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;


--
-- Name: trg_urgency_client_cases(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_client_cases"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;


--
-- Name: trg_urgency_client_payments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_client_payments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;


--
-- Name: trg_urgency_client_report_meta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_client_report_meta"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;


--
-- Name: trg_urgency_documents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_documents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;


--
-- Name: trg_urgency_emotion_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_emotion_logs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN PERFORM public.calculate_client_urgency(NEW.user_id); END IF;
  RETURN NEW;
END; $$;


--
-- Name: trg_urgency_messages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_messages"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE cid uuid;
BEGIN
  SELECT t.client_id INTO cid FROM public.message_threads t
   WHERE t.id = COALESCE(NEW.thread_id, OLD.thread_id);
  IF cid IS NOT NULL THEN PERFORM public.calculate_client_urgency(cid); END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


--
-- Name: trg_urgency_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_urgency_reports"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.calculate_client_urgency(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;


--
-- Name: upsert_my_push_subscription("text", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."upsert_my_push_subscription"("_endpoint" "text", "_keys" "jsonb", "_user_agent" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(_endpoint), '') is null then
    raise exception 'Missing push endpoint';
  end if;

  if _keys is null
     or not (_keys ? 'p256dh')
     or not (_keys ? 'auth') then
    raise exception 'Missing push keys';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    keys,
    user_agent,
    is_active,
    last_used_at
  )
  values (
    auth.uid(),
    _endpoint,
    _keys,
    _user_agent,
    true,
    now()
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        keys = excluded.keys,
        user_agent = excluded.user_agent,
        is_active = true,
        last_used_at = now();
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: agreement_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."agreement_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body_md" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "required" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: appointment_notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."appointment_notification_log" (
    "appointment_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "recipient_role" "text" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "location" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outcome" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "availability_request_id" "uuid",
    "provider_name" "text",
    "practitioner_name" "text",
    "category" "text",
    "client_visible_notes" "text",
    "advocate_private_notes" "text",
    "preparation_instructions" "text",
    "what_to_bring" "text",
    CONSTRAINT "appointments_outcome_check" CHECK (("outcome" = ANY (ARRAY['scheduled'::"text", 'attended'::"text", 'rescheduled'::"text", 'cancelled_missed'::"text"])))
);


--
-- Name: attention_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."attention_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "signal_type" "text" NOT NULL,
    "thread_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_resolved_at" timestamp with time zone,
    "noted_at" timestamp with time zone,
    "noted_by" "uuid"
);


--
-- Name: availability_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."availability_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "availability_request_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "time_window" "text" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "selected_by_client" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "availability_options_time_window_check" CHECK (("time_window" = ANY (ARRAY['morning'::"text", 'afternoon'::"text", 'evening'::"text", 'specific'::"text"])))
);


--
-- Name: availability_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."availability_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "advocate_id" "uuid" NOT NULL,
    "appointment_category" "text" NOT NULL,
    "appointment_purpose" "text" DEFAULT ''::"text" NOT NULL,
    "provider_name" "text",
    "clinic_name" "text",
    "location" "text",
    "date_range_start" "date" NOT NULL,
    "date_range_end" "date" NOT NULL,
    "urgency" "text" DEFAULT 'flexible'::"text" NOT NULL,
    "preferred_appointment_length_minutes" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "interpreter_needed" boolean DEFAULT false NOT NULL,
    "telehealth_acceptable" boolean DEFAULT true NOT NULL,
    "in_person_required" boolean DEFAULT false NOT NULL,
    "transport_considerations" "text",
    "advocate_notes" "text",
    "client_facing_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "client_responded_at" timestamp with time zone,
    CONSTRAINT "availability_requests_appointment_category_check" CHECK (("appointment_category" = ANY (ARRAY['GP'::"text", 'Specialist'::"text", 'Hospital'::"text", 'STI_clinic'::"text", 'Blood_test'::"text", 'Ultrasound'::"text", 'Imaging'::"text", 'Pathology'::"text", 'Follow_up'::"text", 'Other'::"text"]))),
    CONSTRAINT "availability_requests_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent_to_client'::"text", 'waiting_for_client'::"text", 'client_responded'::"text", 'ready_to_book'::"text", 'clinic_contacted'::"text", 'appointment_confirmed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "availability_requests_urgency_check" CHECK (("urgency" = ANY (ARRAY['flexible'::"text", 'soon'::"text", 'important'::"text"])))
);


--
-- Name: client_agreement_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_agreement_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "document_slug" "text" NOT NULL,
    "document_version" integer NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by_user_id" "uuid",
    "method" "text" DEFAULT 'checkbox_v1'::"text" NOT NULL,
    "ip" "text",
    "user_agent" "text",
    "notes" "text"
);


--
-- Name: client_availability_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_availability_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "availability_request_id" "uuid" NOT NULL,
    "prefers_morning" boolean DEFAULT false NOT NULL,
    "prefers_afternoon" boolean DEFAULT false NOT NULL,
    "prefers_after_work" boolean DEFAULT false NOT NULL,
    "prefers_telehealth" boolean DEFAULT false NOT NULL,
    "needs_transport" boolean DEFAULT false NOT NULL,
    "needs_interpreter" boolean DEFAULT false NOT NULL,
    "cannot_attend_this_week" boolean DEFAULT false NOT NULL,
    "needs_help_deciding" boolean DEFAULT false NOT NULL,
    "flexible" boolean DEFAULT false NOT NULL,
    "client_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: client_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "case_title" "text" NOT NULL,
    "service_type" "text" NOT NULL,
    "case_status" "text" DEFAULT 'New'::"text" NOT NULL,
    "tier" "text",
    "payment_state" "text",
    "primary_goal" "text",
    "main_advocacy_area" "text",
    "complexity_level" "text",
    "next_action" "text",
    "next_action_due_at" timestamp with time zone,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_cases_case_status_chk" CHECK (("case_status" = ANY (ARRAY['New'::"text", 'Discovery'::"text", 'Agreement pending'::"text", 'Payment pending'::"text", 'In progress'::"text", 'Waiting on client'::"text", 'Waiting on clinic'::"text", 'Follow-up required'::"text", 'Completed'::"text", 'Ongoing support'::"text", 'Closed'::"text"]))),
    CONSTRAINT "client_cases_complexity_chk" CHECK ((("complexity_level" IS NULL) OR ("complexity_level" = ANY (ARRAY['Simple'::"text", 'Moderate'::"text", 'Complex'::"text"])))),
    CONSTRAINT "client_cases_payment_state_chk" CHECK ((("payment_state" IS NULL) OR ("payment_state" = ANY (ARRAY['Unpaid'::"text", 'Deposit paid'::"text", 'Partially paid'::"text", 'Paid'::"text", 'Overdue'::"text", 'Waived'::"text", 'N/A'::"text"])))),
    CONSTRAINT "client_cases_service_type_chk" CHECK (("service_type" = ANY (ARRAY['Appointment preparation'::"text", 'Appointment attendance'::"text", 'Health admin support'::"text", 'Document organisation'::"text", 'Care coordination'::"text", 'Report preparation'::"text", 'Ongoing advocacy support'::"text", 'Other'::"text"])))
);


--
-- Name: client_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "lang" "text" DEFAULT 'en'::"text" NOT NULL,
    "consent_text" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    CONSTRAINT "client_consents_kind_check" CHECK (("kind" = ANY (ARRAY['scope_acknowledgment'::"text", 'privacy_consent'::"text"])))
);


--
-- Name: client_fee_arrangements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_fee_arrangements" (
    "client_id" "uuid" NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "model" "public"."fee_model" DEFAULT 'tier_50_50'::"public"."fee_model" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


--
-- Name: client_internal_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_internal_notes" (
    "client_id" "uuid" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


--
-- Name: client_navigation_intake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_navigation_intake" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "case_id" "uuid",
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "help_with" "text",
    "whats_going_on" "text",
    "step_contacted_gp" boolean DEFAULT false NOT NULL,
    "step_got_referral" boolean DEFAULT false NOT NULL,
    "step_appointment_booked" boolean DEFAULT false NOT NULL,
    "steps_notes" "text",
    "matters_most" "text",
    "source" "text" DEFAULT 'onboarding'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: client_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "kind" "public"."payment_kind" DEFAULT 'custom'::"public"."payment_kind" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "invoice_given" boolean DEFAULT false NOT NULL,
    "invoice_given_at" timestamp with time zone,
    "paid" boolean DEFAULT false NOT NULL,
    "paid_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


--
-- Name: client_report_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."client_report_meta" (
    "client_id" "uuid" NOT NULL,
    "report_progress" smallint DEFAULT 0 NOT NULL,
    "report_requested_from" "date",
    "report_requested_to" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_report_meta_report_progress_check" CHECK ((("report_progress" >= 0) AND ("report_progress" <= 100)))
);


--
-- Name: clinic_contact_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."clinic_contact_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "availability_request_id" "uuid" NOT NULL,
    "advocate_id" "uuid" NOT NULL,
    "clinic_name" "text" DEFAULT ''::"text" NOT NULL,
    "phone_number" "text",
    "contacted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "person_spoken_to" "text",
    "accepts_advocate" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "requires_authority_form" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "outcome" "text" DEFAULT 'not_contacted'::"text" NOT NULL,
    "notes" "text",
    "next_action" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clinic_contact_logs_accepts_advocate_check" CHECK (("accepts_advocate" = ANY (ARRAY['yes'::"text", 'no'::"text", 'unknown'::"text"]))),
    CONSTRAINT "clinic_contact_logs_outcome_check" CHECK (("outcome" = ANY (ARRAY['not_contacted'::"text", 'called_no_answer'::"text", 'waiting_for_callback'::"text", 'clinic_accepted_advocacy'::"text", 'clinic_requires_consent_form'::"text", 'appointment_offered'::"text", 'appointment_booked'::"text"]))),
    CONSTRAINT "clinic_contact_logs_requires_authority_form_check" CHECK (("requires_authority_form" = ANY (ARRAY['yes'::"text", 'no'::"text", 'unknown'::"text"])))
);


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."document_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "audience" "public"."template_audience" DEFAULT 'patient'::"public"."template_audience" NOT NULL,
    "storage_path" "text",
    "file_name" "text",
    "mime_type" "text",
    "size_bytes" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint,
    "status" "public"."document_status" DEFAULT 'pending_review'::"public"."document_status" NOT NULL,
    "triaged_at" timestamp with time zone,
    "triaged_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visibility" "public"."document_visibility" DEFAULT 'shared'::"public"."document_visibility" NOT NULL
);

ALTER TABLE ONLY "public"."documents" REPLICA IDENTITY FULL;


--
-- Name: email_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "old_email" "text" NOT NULL,
    "new_email" "text" NOT NULL,
    "initiated_by" "uuid" NOT NULL,
    "initiator_role" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "verified_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "error_message" "text",
    CONSTRAINT "email_change_requests_initiator_role_check" CHECK (("initiator_role" = ANY (ARRAY['advocate'::"text", 'client'::"text"]))),
    CONSTRAINT "email_change_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'cancelled'::"text", 'expired'::"text", 'failed'::"text"])))
);


--
-- Name: email_send_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_send_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "text",
    "template_name" "text" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "status" "text" NOT NULL,
    "error_message" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_send_log_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'suppressed'::"text", 'failed'::"text", 'bounced'::"text", 'complained'::"text", 'dlq'::"text"])))
);


--
-- Name: email_send_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_send_state" (
    "id" integer DEFAULT 1 NOT NULL,
    "retry_after_until" timestamp with time zone,
    "batch_size" integer DEFAULT 10 NOT NULL,
    "send_delay_ms" integer DEFAULT 200 NOT NULL,
    "auth_email_ttl_minutes" integer DEFAULT 15 NOT NULL,
    "transactional_email_ttl_minutes" integer DEFAULT 60 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_send_state_id_check" CHECK (("id" = 1))
);


--
-- Name: email_unsubscribe_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."email_unsubscribe_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_at" timestamp with time zone
);


--
-- Name: emotion_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."emotion_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "emotion" "text" NOT NULL,
    "optional_note" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "emotion_logs_emotion_check" CHECK ((("char_length"("emotion") >= 1) AND ("char_length"("emotion") <= 40))),
    CONSTRAINT "emotion_logs_note_check" CHECK ((("optional_note" IS NULL) OR ("char_length"("optional_note") <= 4000)))
);


--
-- Name: inbound_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."inbound_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "subject" "text",
    "message" "text" NOT NULL,
    "status" "public"."inbound_message_status" DEFAULT 'new'::"public"."inbound_message_status" NOT NULL,
    "read_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "user_agent" "text",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "internal_notes" "text",
    "assigned_advocate" "uuid",
    "converted_client_id" "uuid",
    "converted_at" timestamp with time zone,
    "last_contacted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preferred_contact" "text",
    "service_interest" "text",
    "enquiry_status" "text" DEFAULT 'New'::"text" NOT NULL,
    "source" "text" DEFAULT 'in_app_contact'::"text",
    CONSTRAINT "inbound_messages_enquiry_status_check" CHECK (("enquiry_status" = ANY (ARRAY['New'::"text", 'Reviewed'::"text", 'Replied'::"text", 'Discovery call offered'::"text", 'Discovery call booked'::"text", 'Invite sent'::"text", 'Converted to client'::"text", 'Not suitable'::"text", 'No response'::"text", 'Archived'::"text"]))),
    CONSTRAINT "inbound_messages_source_check" CHECK ((("source" IS NULL) OR ("source" = ANY (ARRAY['website_form'::"text", 'manual'::"text", 'calendly'::"text", 'email'::"text", 'referral'::"text", 'in_app_contact'::"text"]))))
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "uploader_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_attachments_size_bytes_check" CHECK ((("size_bytes" > 0) AND ("size_bytes" <= 26214400)))
);


--
-- Name: message_notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."message_notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "email_number" smallint NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_notification_log_email_number_check" CHECK (("email_number" = ANY (ARRAY[1, 2])))
);


--
-- Name: message_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."message_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "advocate_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "messages_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 5000)))
);


--
-- Name: mfa_recovery_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."mfa_recovery_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notification_settings" (
    "user_id" "uuid" NOT NULL,
    "email_on_new_message" boolean DEFAULT true NOT NULL,
    "quiet_hours_enabled" boolean DEFAULT true NOT NULL,
    "quiet_start" time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    "quiet_end" time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    "timezone" "text" DEFAULT 'Australia/Perth'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "push_on_new_message" boolean DEFAULT false NOT NULL,
    "inapp_enabled" boolean DEFAULT true NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_role" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_user_role_check" CHECK (("user_role" = ANY (ARRAY['client'::"text", 'advocate'::"text"])))
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


--
-- Name: payment_note_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_note_dismissals" (
    "client_id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "dismissed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_reminders_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_reminders_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: payment_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payment_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "bank_details" "text" DEFAULT ''::"text" NOT NULL,
    "currency" "text" DEFAULT 'AUD'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "payment_settings_single_row" CHECK (("id" = 1))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "must_change_password" boolean DEFAULT false NOT NULL,
    "activated_at" timestamp with time zone,
    "tier" "public"."client_tier" DEFAULT 'tier_1'::"public"."client_tier" NOT NULL,
    "report_status" "public"."client_report_status" DEFAULT 'not_started'::"public"."client_report_status" NOT NULL,
    "client_colour" "text" DEFAULT 'ocean'::"text" NOT NULL,
    "payment_status" "public"."client_payment_status" DEFAULT 'unpaid'::"public"."client_payment_status" NOT NULL,
    "client_progress" smallint DEFAULT 0 NOT NULL,
    "messages_banner_dismissed_at" timestamp with time zone,
    "lifecycle_status" "public"."client_lifecycle_status" DEFAULT 'New enquiry'::"public"."client_lifecycle_status",
    "urgency_score" integer DEFAULT 0 NOT NULL,
    "urgency_level" "text" DEFAULT 'Stable'::"text" NOT NULL,
    "last_urgency_calculated_at" timestamp with time zone,
    "onboarding_completed_at" timestamp with time zone,
    "preferred_name" "text",
    "preferred_language" "text",
    "preferred_contact_method" "text",
    "navigation_intake_seen_at" timestamp with time zone,
    CONSTRAINT "profiles_client_progress_range" CHECK ((("client_progress" >= 0) AND ("client_progress" <= 100))),
    CONSTRAINT "profiles_urgency_level_chk" CHECK (("urgency_level" = ANY (ARRAY['Critical'::"text", 'High'::"text", 'Medium'::"text", 'Low'::"text", 'Stable'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "keys" "jsonb" NOT NULL,
    "user_agent" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: report_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."report_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "author_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_comments_author_role_check" CHECK (("author_role" = ANY (ARRAY['advocate'::"text", 'client'::"text"]))),
    CONSTRAINT "report_comments_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 4000)))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "storage_path" "text",
    "file_name" "text",
    "mime_type" "text",
    "size_bytes" bigint,
    "status" "public"."report_review_status" DEFAULT 'draft'::"public"."report_review_status" NOT NULL,
    "shared_at" timestamp with time zone,
    "client_agreed_at" timestamp with time zone,
    "client_feedback" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stage" "public"."report_stage" DEFAULT 'draft'::"public"."report_stage" NOT NULL,
    "visibility" "public"."report_visibility" DEFAULT 'private'::"public"."report_visibility" NOT NULL
);


--
-- Name: suppressed_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."suppressed_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "suppressed_emails_reason_check" CHECK (("reason" = ANY (ARRAY['unsubscribe'::"text", 'bounce'::"text", 'complaint'::"text"])))
);


--
-- Name: task_status_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."task_status_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "from_status" "public"."task_status",
    "to_status" "public"."task_status" NOT NULL,
    "title_snapshot" "text" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: task_subtasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."task_subtasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_task_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "done_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "public"."task_status" DEFAULT 'to_do'::"public"."task_status" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "due_date" "date",
    "due_time" timestamp with time zone,
    "time_block_end" timestamp with time zone,
    "reminder_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "is_priority" boolean DEFAULT false NOT NULL,
    "auto_dedup_key" "text"
);

ALTER TABLE ONLY "public"."tasks" REPLICA IDENTITY FULL;


--
-- Name: trusted_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trusted_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "label" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: agreement_documents agreement_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agreement_documents"
    ADD CONSTRAINT "agreement_documents_pkey" PRIMARY KEY ("id");


--
-- Name: agreement_documents agreement_documents_slug_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."agreement_documents"
    ADD CONSTRAINT "agreement_documents_slug_version_key" UNIQUE ("slug", "version");


--
-- Name: appointment_notification_log appointment_notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."appointment_notification_log"
    ADD CONSTRAINT "appointment_notification_log_pkey" PRIMARY KEY ("appointment_id", "kind", "channel", "recipient_role");


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");


--
-- Name: attention_signals attention_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attention_signals"
    ADD CONSTRAINT "attention_signals_pkey" PRIMARY KEY ("id");


--
-- Name: availability_options availability_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."availability_options"
    ADD CONSTRAINT "availability_options_pkey" PRIMARY KEY ("id");


--
-- Name: availability_requests availability_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."availability_requests"
    ADD CONSTRAINT "availability_requests_pkey" PRIMARY KEY ("id");


--
-- Name: client_agreement_acceptances client_agreement_acceptances_client_id_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_agreement_acceptances"
    ADD CONSTRAINT "client_agreement_acceptances_client_id_document_id_key" UNIQUE ("client_id", "document_id");


--
-- Name: client_agreement_acceptances client_agreement_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_agreement_acceptances"
    ADD CONSTRAINT "client_agreement_acceptances_pkey" PRIMARY KEY ("id");


--
-- Name: client_availability_preferences client_availability_preferences_availability_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_availability_preferences"
    ADD CONSTRAINT "client_availability_preferences_availability_request_id_key" UNIQUE ("availability_request_id");


--
-- Name: client_availability_preferences client_availability_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_availability_preferences"
    ADD CONSTRAINT "client_availability_preferences_pkey" PRIMARY KEY ("id");


--
-- Name: client_cases client_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_cases"
    ADD CONSTRAINT "client_cases_pkey" PRIMARY KEY ("id");


--
-- Name: client_consents client_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_consents"
    ADD CONSTRAINT "client_consents_pkey" PRIMARY KEY ("id");


--
-- Name: client_fee_arrangements client_fee_arrangements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_fee_arrangements"
    ADD CONSTRAINT "client_fee_arrangements_pkey" PRIMARY KEY ("client_id");


--
-- Name: client_internal_notes client_internal_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_internal_notes"
    ADD CONSTRAINT "client_internal_notes_pkey" PRIMARY KEY ("client_id");


--
-- Name: client_navigation_intake client_navigation_intake_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_navigation_intake"
    ADD CONSTRAINT "client_navigation_intake_pkey" PRIMARY KEY ("id");


--
-- Name: client_payments client_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_payments"
    ADD CONSTRAINT "client_payments_pkey" PRIMARY KEY ("id");


--
-- Name: client_report_meta client_report_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_report_meta"
    ADD CONSTRAINT "client_report_meta_pkey" PRIMARY KEY ("client_id");


--
-- Name: clinic_contact_logs clinic_contact_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_contact_logs"
    ADD CONSTRAINT "clinic_contact_logs_pkey" PRIMARY KEY ("id");


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."document_templates"
    ADD CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id");


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");


--
-- Name: email_change_requests email_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_change_requests"
    ADD CONSTRAINT "email_change_requests_pkey" PRIMARY KEY ("id");


--
-- Name: email_send_log email_send_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_send_log"
    ADD CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id");


--
-- Name: email_send_state email_send_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_send_state"
    ADD CONSTRAINT "email_send_state_pkey" PRIMARY KEY ("id");


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_email_key" UNIQUE ("email");


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."email_unsubscribe_tokens"
    ADD CONSTRAINT "email_unsubscribe_tokens_token_key" UNIQUE ("token");


--
-- Name: emotion_logs emotion_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."emotion_logs"
    ADD CONSTRAINT "emotion_logs_pkey" PRIMARY KEY ("id");


--
-- Name: inbound_messages inbound_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."inbound_messages"
    ADD CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id");


--
-- Name: message_attachments message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");


--
-- Name: message_attachments message_attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_storage_path_key" UNIQUE ("storage_path");


--
-- Name: message_notification_log message_notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_notification_log"
    ADD CONSTRAINT "message_notification_log_pkey" PRIMARY KEY ("id");


--
-- Name: message_threads message_threads_client_id_advocate_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_client_id_advocate_id_key" UNIQUE ("client_id", "advocate_id");


--
-- Name: message_threads message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id");


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");


--
-- Name: mfa_recovery_codes mfa_recovery_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id");


--
-- Name: mfa_recovery_codes mfa_recovery_codes_user_id_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_user_id_code_hash_key" UNIQUE ("user_id", "code_hash");


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: payment_note_dismissals payment_note_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_note_dismissals"
    ADD CONSTRAINT "payment_note_dismissals_pkey" PRIMARY KEY ("client_id", "payment_id");


--
-- Name: payment_reminders_log payment_reminders_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reminders_log"
    ADD CONSTRAINT "payment_reminders_log_pkey" PRIMARY KEY ("id");


--
-- Name: payment_settings payment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_settings"
    ADD CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: report_comments report_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_comments"
    ADD CONSTRAINT "report_comments_pkey" PRIMARY KEY ("id");


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");


--
-- Name: suppressed_emails suppressed_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."suppressed_emails"
    ADD CONSTRAINT "suppressed_emails_email_key" UNIQUE ("email");


--
-- Name: suppressed_emails suppressed_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."suppressed_emails"
    ADD CONSTRAINT "suppressed_emails_pkey" PRIMARY KEY ("id");


--
-- Name: task_status_events task_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."task_status_events"
    ADD CONSTRAINT "task_status_events_pkey" PRIMARY KEY ("id");


--
-- Name: task_subtasks task_subtasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."task_subtasks"
    ADD CONSTRAINT "task_subtasks_pkey" PRIMARY KEY ("id");


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");


--
-- Name: trusted_devices trusted_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trusted_devices"
    ADD CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");


--
-- Name: attention_signals_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "attention_signals_active_idx" ON "public"."attention_signals" USING "btree" ("client_id") WHERE (("auto_resolved_at" IS NULL) AND ("noted_at" IS NULL));


--
-- Name: attention_signals_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "attention_signals_active_unique" ON "public"."attention_signals" USING "btree" ("client_id", "signal_type") WHERE (("auto_resolved_at" IS NULL) AND ("noted_at" IS NULL));


--
-- Name: client_payments_client_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "client_payments_client_id_idx" ON "public"."client_payments" USING "btree" ("client_id");


--
-- Name: client_payments_unique_deposit; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "client_payments_unique_deposit" ON "public"."client_payments" USING "btree" ("client_id") WHERE ("kind" = 'deposit'::"public"."payment_kind");


--
-- Name: client_payments_unique_final; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "client_payments_unique_final" ON "public"."client_payments" USING "btree" ("client_id") WHERE ("kind" = 'final'::"public"."payment_kind");


--
-- Name: email_change_one_pending_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "email_change_one_pending_per_user" ON "public"."email_change_requests" USING "btree" ("user_id") WHERE ("status" = 'pending'::"text");


--
-- Name: email_change_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "email_change_token_hash_idx" ON "public"."email_change_requests" USING "btree" ("token_hash");


--
-- Name: email_change_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "email_change_user_idx" ON "public"."email_change_requests" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_appointments_avail_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_appointments_avail_req" ON "public"."appointments" USING "btree" ("availability_request_id");


--
-- Name: idx_avail_opt_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_avail_opt_req" ON "public"."availability_options" USING "btree" ("availability_request_id");


--
-- Name: idx_avail_req_advocate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_avail_req_advocate" ON "public"."availability_requests" USING "btree" ("advocate_id", "status");


--
-- Name: idx_avail_req_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_avail_req_client" ON "public"."availability_requests" USING "btree" ("client_id", "status");


--
-- Name: idx_client_cases_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_client_cases_client_id" ON "public"."client_cases" USING "btree" ("client_id");


--
-- Name: idx_client_cases_client_opened; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_client_cases_client_opened" ON "public"."client_cases" USING "btree" ("client_id", "opened_at" DESC);


--
-- Name: idx_client_cases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_client_cases_status" ON "public"."client_cases" USING "btree" ("case_status");


--
-- Name: idx_client_consents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_client_consents_user" ON "public"."client_consents" USING "btree" ("user_id", "kind");


--
-- Name: idx_client_navigation_intake_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_client_navigation_intake_case" ON "public"."client_navigation_intake" USING "btree" ("case_id");


--
-- Name: idx_client_navigation_intake_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_client_navigation_intake_client" ON "public"."client_navigation_intake" USING "btree" ("client_id");


--
-- Name: idx_clinic_logs_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_clinic_logs_req" ON "public"."clinic_contact_logs" USING "btree" ("availability_request_id");


--
-- Name: idx_email_send_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_send_log_created" ON "public"."email_send_log" USING "btree" ("created_at" DESC);


--
-- Name: idx_email_send_log_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_send_log_message" ON "public"."email_send_log" USING "btree" ("message_id");


--
-- Name: idx_email_send_log_message_sent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_email_send_log_message_sent_unique" ON "public"."email_send_log" USING "btree" ("message_id") WHERE ("status" = 'sent'::"text");


--
-- Name: idx_email_send_log_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_send_log_recipient" ON "public"."email_send_log" USING "btree" ("recipient_email");


--
-- Name: idx_emotion_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_emotion_logs_created_at" ON "public"."emotion_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_inbound_messages_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_inbound_messages_status_created" ON "public"."inbound_messages" USING "btree" ("status", "created_at" DESC);


--
-- Name: idx_message_attachments_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_attachments_message" ON "public"."message_attachments" USING "btree" ("message_id");


--
-- Name: idx_message_attachments_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_attachments_thread" ON "public"."message_attachments" USING "btree" ("thread_id");


--
-- Name: idx_message_notif_log_thread_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_notif_log_thread_user" ON "public"."message_notification_log" USING "btree" ("thread_id", "user_id", "sent_at" DESC);


--
-- Name: idx_message_threads_advocate_last; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_threads_advocate_last" ON "public"."message_threads" USING "btree" ("advocate_id", "last_message_at" DESC NULLS LAST);


--
-- Name: idx_message_threads_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_message_threads_client" ON "public"."message_threads" USING "btree" ("client_id");


--
-- Name: idx_messages_thread_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_messages_thread_created" ON "public"."messages" USING "btree" ("thread_id", "created_at" DESC);


--
-- Name: idx_mfa_recovery_codes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_mfa_recovery_codes_user" ON "public"."mfa_recovery_codes" USING "btree" ("user_id");


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE (("read_at" IS NULL) AND ("dismissed_at" IS NULL));


--
-- Name: idx_report_comments_report; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_report_comments_report" ON "public"."report_comments" USING "btree" ("report_id", "created_at");


--
-- Name: idx_reports_client_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_reports_client_created" ON "public"."reports" USING "btree" ("client_id", "created_at");


--
-- Name: idx_suppressed_emails_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_suppressed_emails_email" ON "public"."suppressed_emails" USING "btree" ("email");


--
-- Name: idx_task_subtasks_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_task_subtasks_parent" ON "public"."task_subtasks" USING "btree" ("parent_task_id", "sort_order");


--
-- Name: idx_tasks_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tasks_client_id" ON "public"."tasks" USING "btree" ("client_id");


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tasks_due_date" ON "public"."tasks" USING "btree" ("due_date") WHERE ("status" = 'to_do'::"public"."task_status");


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");


--
-- Name: idx_trusted_devices_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_trusted_devices_user" ON "public"."trusted_devices" USING "btree" ("user_id");


--
-- Name: idx_trusted_devices_user_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_trusted_devices_user_hash" ON "public"."trusted_devices" USING "btree" ("user_id", "token_hash");


--
-- Name: idx_unsubscribe_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_unsubscribe_tokens_token" ON "public"."email_unsubscribe_tokens" USING "btree" ("token");


--
-- Name: inbound_messages_enquiry_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "inbound_messages_enquiry_status_idx" ON "public"."inbound_messages" USING "btree" ("enquiry_status");


--
-- Name: payment_reminders_log_payment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_reminders_log_payment_idx" ON "public"."payment_reminders_log" USING "btree" ("payment_id");


--
-- Name: push_subscriptions_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "push_subscriptions_user_active_idx" ON "public"."push_subscriptions" USING "btree" ("user_id") WHERE "is_active";


--
-- Name: task_status_events_client_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "task_status_events_client_at_idx" ON "public"."task_status_events" USING "btree" ("client_id", "at" DESC);


--
-- Name: tasks_auto_dedup_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tasks_auto_dedup_key_unique" ON "public"."tasks" USING "btree" ("auto_dedup_key") WHERE (("auto_dedup_key" IS NOT NULL) AND ("status" <> 'complete'::"public"."task_status"));


--
-- Name: tasks_due_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_due_time_idx" ON "public"."tasks" USING "btree" ("due_time") WHERE ("due_time" IS NOT NULL);


--
-- Name: tasks_reminder_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_reminder_at_idx" ON "public"."tasks" USING "btree" ("reminder_at") WHERE (("reminder_at" IS NOT NULL) AND ("reminder_sent_at" IS NULL));


--
-- Name: appointments appointments_recompute_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "appointments_recompute_progress" AFTER INSERT OR DELETE OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_appointments"();


--
-- Name: documents documents_recompute_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "documents_recompute_progress" AFTER INSERT OR DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_documents"();


--
-- Name: profiles guard_profile_advocate_fields_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "guard_profile_advocate_fields_trg" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_advocate_fields"();


--
-- Name: profiles profiles_guard_advocate_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "profiles_guard_advocate_fields" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_advocate_fields"();


--
-- Name: report_comments report_comments_set_author; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "report_comments_set_author" BEFORE INSERT ON "public"."report_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_report_comment_author_role"();


--
-- Name: tasks tasks_recompute_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tasks_recompute_progress" AFTER INSERT OR DELETE OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recompute_tasks"();


--
-- Name: client_internal_notes touch_client_internal_notes_t; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_client_internal_notes_t" BEFORE INSERT OR UPDATE ON "public"."client_internal_notes" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_internal_notes"();


--
-- Name: client_payments touch_client_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_client_payments" BEFORE INSERT OR UPDATE ON "public"."client_payments" FOR EACH ROW EXECUTE FUNCTION "public"."touch_payment_row"();


--
-- Name: client_report_meta touch_client_report_meta_t; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_client_report_meta_t" BEFORE UPDATE ON "public"."client_report_meta" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_report_meta"();


--
-- Name: client_fee_arrangements touch_fee_arrangements; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_fee_arrangements" BEFORE INSERT OR UPDATE ON "public"."client_fee_arrangements" FOR EACH ROW EXECUTE FUNCTION "public"."touch_payment_row"();


--
-- Name: payment_settings touch_payment_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_payment_settings" BEFORE UPDATE ON "public"."payment_settings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_payment_row"();


--
-- Name: appointments trg_auto_task_appt_attended; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_auto_task_appt_attended" AFTER UPDATE OF "outcome" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_task_appt_attended"();


--
-- Name: appointments trg_auto_task_appt_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_auto_task_appt_created" AFTER INSERT ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_task_appt_created"();


--
-- Name: profiles trg_auto_task_client_activated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_auto_task_client_activated" AFTER INSERT OR UPDATE OF "activated_at" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_task_client_activated"();


--
-- Name: documents trg_auto_task_doc_uploaded; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_auto_task_doc_uploaded" AFTER INSERT ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_task_doc_uploaded"();


--
-- Name: report_comments trg_auto_task_report_feedback; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_auto_task_report_feedback" AFTER INSERT ON "public"."report_comments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_task_report_feedback"();


--
-- Name: availability_requests trg_availability_requests_status_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_availability_requests_status_guard" BEFORE UPDATE OF "status" ON "public"."availability_requests" FOR EACH ROW EXECUTE FUNCTION "public"."availability_requests_status_guard"();


--
-- Name: availability_requests trg_availability_requests_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_availability_requests_touch" BEFORE INSERT OR UPDATE ON "public"."availability_requests" FOR EACH ROW EXECUTE FUNCTION "public"."availability_requests_touch"();


--
-- Name: messages trg_bump_thread_last_message_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_bump_thread_last_message_at" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_thread_last_message_at"();


--
-- Name: client_availability_preferences trg_client_availability_preferences_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_client_availability_preferences_touch" BEFORE UPDATE ON "public"."client_availability_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."client_availability_preferences_touch"();


--
-- Name: client_cases trg_client_cases_auto_close; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_client_cases_auto_close" BEFORE INSERT OR UPDATE OF "case_status" ON "public"."client_cases" FOR EACH ROW EXECUTE FUNCTION "public"."client_cases_auto_close"();


--
-- Name: client_cases trg_client_cases_sync_task; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_client_cases_sync_task" AFTER INSERT OR UPDATE ON "public"."client_cases" FOR EACH ROW EXECUTE FUNCTION "public"."client_cases_sync_next_action_task"();


--
-- Name: client_cases trg_client_cases_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_client_cases_touch" BEFORE UPDATE ON "public"."client_cases" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_cases_updated_at"();


--
-- Name: clinic_contact_logs trg_clinic_contact_logs_stamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_clinic_contact_logs_stamp" BEFORE INSERT ON "public"."clinic_contact_logs" FOR EACH ROW EXECUTE FUNCTION "public"."clinic_contact_logs_stamp"();


--
-- Name: inbound_messages trg_inbound_messages_create_task; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_inbound_messages_create_task" AFTER INSERT ON "public"."inbound_messages" FOR EACH ROW EXECUTE FUNCTION "public"."create_task_on_new_enquiry"();


--
-- Name: tasks trg_log_task_status_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_task_status_event" AFTER INSERT OR UPDATE OF "status" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."log_task_status_event"();


--
-- Name: profiles trg_profile_activated_create_thread; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_profile_activated_create_thread" AFTER INSERT OR UPDATE OF "activated_at" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_profile_activation_thread"();


--
-- Name: reports trg_reports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_reports_updated_at" BEFORE UPDATE ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."touch_reports_updated_at"();


--
-- Name: messages trg_set_message_sender_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_message_sender_role" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_sender_role"();


--
-- Name: client_navigation_intake trg_touch_client_navigation_intake; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_client_navigation_intake" BEFORE UPDATE ON "public"."client_navigation_intake" FOR EACH ROW EXECUTE FUNCTION "public"."touch_client_navigation_intake"();


--
-- Name: inbound_messages trg_touch_inbound_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_inbound_messages_updated_at" BEFORE UPDATE ON "public"."inbound_messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_inbound_messages_updated_at"();


--
-- Name: task_subtasks trg_touch_task_subtasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_task_subtasks_updated_at" BEFORE UPDATE ON "public"."task_subtasks" FOR EACH ROW EXECUTE FUNCTION "public"."touch_task_subtasks_updated_at"();


--
-- Name: appointments urgency_appointments_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_appointments_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_appointments"();


--
-- Name: client_cases urgency_client_cases_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_client_cases_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."client_cases" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_client_cases"();


--
-- Name: client_payments urgency_client_payments_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_client_payments_trg" AFTER INSERT OR DELETE OR UPDATE OF "paid", "invoice_given" ON "public"."client_payments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_client_payments"();


--
-- Name: client_report_meta urgency_client_report_meta_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_client_report_meta_trg" AFTER INSERT OR UPDATE ON "public"."client_report_meta" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_client_report_meta"();


--
-- Name: documents urgency_documents_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_documents_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_documents"();


--
-- Name: emotion_logs urgency_emotion_logs_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_emotion_logs_trg" AFTER INSERT ON "public"."emotion_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_emotion_logs"();


--
-- Name: messages urgency_messages_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_messages_trg" AFTER INSERT OR UPDATE OF "read_at" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_messages"();


--
-- Name: reports urgency_reports_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "urgency_reports_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."trg_urgency_reports"();


--
-- Name: appointments appointments_availability_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_availability_request_id_fkey" FOREIGN KEY ("availability_request_id") REFERENCES "public"."availability_requests"("id") ON DELETE SET NULL;


--
-- Name: availability_options availability_options_availability_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."availability_options"
    ADD CONSTRAINT "availability_options_availability_request_id_fkey" FOREIGN KEY ("availability_request_id") REFERENCES "public"."availability_requests"("id") ON DELETE CASCADE;


--
-- Name: client_agreement_acceptances client_agreement_acceptances_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_agreement_acceptances"
    ADD CONSTRAINT "client_agreement_acceptances_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: client_agreement_acceptances client_agreement_acceptances_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_agreement_acceptances"
    ADD CONSTRAINT "client_agreement_acceptances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."agreement_documents"("id") ON DELETE RESTRICT;


--
-- Name: client_availability_preferences client_availability_preferences_availability_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_availability_preferences"
    ADD CONSTRAINT "client_availability_preferences_availability_request_id_fkey" FOREIGN KEY ("availability_request_id") REFERENCES "public"."availability_requests"("id") ON DELETE CASCADE;


--
-- Name: client_cases client_cases_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_cases"
    ADD CONSTRAINT "client_cases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: client_consents client_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_consents"
    ADD CONSTRAINT "client_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: client_navigation_intake client_navigation_intake_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_navigation_intake"
    ADD CONSTRAINT "client_navigation_intake_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."client_cases"("id") ON DELETE SET NULL;


--
-- Name: client_navigation_intake client_navigation_intake_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."client_navigation_intake"
    ADD CONSTRAINT "client_navigation_intake_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: clinic_contact_logs clinic_contact_logs_availability_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."clinic_contact_logs"
    ADD CONSTRAINT "clinic_contact_logs_availability_request_id_fkey" FOREIGN KEY ("availability_request_id") REFERENCES "public"."availability_requests"("id") ON DELETE CASCADE;


--
-- Name: inbound_messages inbound_messages_assigned_advocate_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."inbound_messages"
    ADD CONSTRAINT "inbound_messages_assigned_advocate_fkey" FOREIGN KEY ("assigned_advocate") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: inbound_messages inbound_messages_converted_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."inbound_messages"
    ADD CONSTRAINT "inbound_messages_converted_client_id_fkey" FOREIGN KEY ("converted_client_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: message_attachments message_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;


--
-- Name: message_attachments message_attachments_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE CASCADE;


--
-- Name: message_attachments message_attachments_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE CASCADE;


--
-- Name: mfa_recovery_codes mfa_recovery_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: payment_note_dismissals payment_note_dismissals_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_note_dismissals"
    ADD CONSTRAINT "payment_note_dismissals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."client_payments"("id") ON DELETE CASCADE;


--
-- Name: payment_reminders_log payment_reminders_log_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payment_reminders_log"
    ADD CONSTRAINT "payment_reminders_log_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."client_payments"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: report_comments report_comments_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_comments"
    ADD CONSTRAINT "report_comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;


--
-- Name: task_subtasks task_subtasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."task_subtasks"
    ADD CONSTRAINT "task_subtasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;


--
-- Name: tasks tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: payment_settings Advocates and clients with outstanding invoices can read settin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates and clients with outstanding invoices can read settin" ON "public"."payment_settings" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."client_payments" "cp"
  WHERE (("cp"."client_id" = "auth"."uid"()) AND ("cp"."invoice_given" = true) AND ("cp"."paid" = false))))));


--
-- Name: inbound_messages Advocates can delete inbound enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates can delete inbound enquiries" ON "public"."inbound_messages" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: profiles Advocates can update any profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates can update any profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: inbound_messages Advocates can update inbound enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates can update inbound enquiries" ON "public"."inbound_messages" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_navigation_intake Advocates can update intake; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates can update intake" ON "public"."client_navigation_intake" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: profiles Advocates can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: user_roles Advocates can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates can view all roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: inbound_messages Advocates can view inbound enquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates can view inbound enquiries" ON "public"."inbound_messages" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: appointments Advocates delete appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete appointments" ON "public"."appointments" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_cases Advocates delete client_cases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete client_cases" ON "public"."client_cases" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: documents Advocates delete documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete documents" ON "public"."documents" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: emotion_logs Advocates delete emotion logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete emotion logs" ON "public"."emotion_logs" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: inbound_messages Advocates delete inbound messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete inbound messages" ON "public"."inbound_messages" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: report_comments Advocates delete report comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete report comments" ON "public"."report_comments" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: reports Advocates delete reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete reports" ON "public"."reports" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: task_subtasks Advocates delete subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete subtasks" ON "public"."task_subtasks" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: tasks Advocates delete tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete tasks" ON "public"."tasks" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: document_templates Advocates delete templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete templates" ON "public"."document_templates" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: message_threads Advocates delete threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates delete threads" ON "public"."message_threads" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: appointments Advocates insert appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_cases Advocates insert client_cases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert client_cases" ON "public"."client_cases" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("created_by" = "auth"."uid"())));


--
-- Name: documents Advocates insert documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert documents" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("uploaded_by" = "auth"."uid"())));


--
-- Name: messages Advocates insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."message_threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."advocate_id" = "auth"."uid"()))))));


--
-- Name: report_comments Advocates insert report comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert report comments" ON "public"."report_comments" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("author_id" = "auth"."uid"()) AND ("author_role" = 'advocate'::"text")));


--
-- Name: reports Advocates insert reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert reports" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("created_by" = "auth"."uid"())));


--
-- Name: task_subtasks Advocates insert subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert subtasks" ON "public"."task_subtasks" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("created_by" = "auth"."uid"())));


--
-- Name: tasks Advocates insert tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert tasks" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("created_by" = "auth"."uid"())));


--
-- Name: document_templates Advocates insert templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert templates" ON "public"."document_templates" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("auth"."uid"() = "created_by")));


--
-- Name: message_threads Advocates insert threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates insert threads" ON "public"."message_threads" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_payments Advocates manage all payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage all payments" ON "public"."client_payments" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: availability_options Advocates manage availability options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage availability options" ON "public"."availability_options" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: availability_requests Advocates manage availability requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage availability requests" ON "public"."availability_requests" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("advocate_id" = "auth"."uid"())));


--
-- Name: client_availability_preferences Advocates manage client availability preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage client availability preferences" ON "public"."client_availability_preferences" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: clinic_contact_logs Advocates manage clinic contact logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage clinic contact logs" ON "public"."clinic_contact_logs" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("advocate_id" = "auth"."uid"())));


--
-- Name: client_fee_arrangements Advocates manage fee arrangements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage fee arrangements" ON "public"."client_fee_arrangements" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_internal_notes Advocates manage internal notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage internal notes" ON "public"."client_internal_notes" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_report_meta Advocates manage report meta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage report meta" ON "public"."client_report_meta" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: payment_settings Advocates manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates manage settings" ON "public"."payment_settings" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: attention_signals Advocates mark attention signals as noted; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates mark attention signals as noted" ON "public"."attention_signals" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_cases Advocates select client_cases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates select client_cases" ON "public"."client_cases" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: documents Advocates update all documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update all documents" ON "public"."documents" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK (("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role") AND ("client_id" = ( SELECT "d"."client_id"
   FROM "public"."documents" "d"
  WHERE ("d"."id" = "documents"."id"))) AND ("uploaded_by" = ( SELECT "d"."uploaded_by"
   FROM "public"."documents" "d"
  WHERE ("d"."id" = "documents"."id")))));


--
-- Name: appointments Advocates update appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update appointments" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: client_cases Advocates update client_cases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update client_cases" ON "public"."client_cases" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: emotion_logs Advocates update emotion logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update emotion logs" ON "public"."emotion_logs" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: inbound_messages Advocates update inbound messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update inbound messages" ON "public"."inbound_messages" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: reports Advocates update reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update reports" ON "public"."reports" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: task_subtasks Advocates update subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update subtasks" ON "public"."task_subtasks" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: tasks Advocates update tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update tasks" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: document_templates Advocates update templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update templates" ON "public"."document_templates" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: message_threads Advocates update threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates update threads" ON "public"."message_threads" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: appointments Advocates view all appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: documents Advocates view all documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all documents" ON "public"."documents" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: email_change_requests Advocates view all email change requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all email change requests" ON "public"."email_change_requests" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: messages Advocates view all messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: report_comments Advocates view all report comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all report comments" ON "public"."report_comments" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: reports Advocates view all reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all reports" ON "public"."reports" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: task_subtasks Advocates view all subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all subtasks" ON "public"."task_subtasks" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: task_status_events Advocates view all task events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all task events" ON "public"."task_status_events" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: tasks Advocates view all tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all tasks" ON "public"."tasks" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: message_threads Advocates view all threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view all threads" ON "public"."message_threads" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: attention_signals Advocates view attention signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view attention signals" ON "public"."attention_signals" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: payment_note_dismissals Advocates view dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view dismissals" ON "public"."payment_note_dismissals" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: inbound_messages Advocates view inbound messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view inbound messages" ON "public"."inbound_messages" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: appointment_notification_log Advocates view notification log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view notification log" ON "public"."appointment_notification_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: payment_reminders_log Advocates view reminders log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view reminders log" ON "public"."payment_reminders_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: document_templates Advocates view templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Advocates view templates" ON "public"."document_templates" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: emotion_logs Anyone can submit a check-in; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit a check-in" ON "public"."emotion_logs" FOR INSERT TO "authenticated", "anon" WITH CHECK (((("char_length"("emotion") >= 1) AND ("char_length"("emotion") <= 40)) AND (("optional_note" IS NULL) OR ("char_length"("optional_note") <= 4000)) AND ((("auth"."uid"() IS NULL) AND ("user_id" IS NULL)) OR (("auth"."uid"() IS NOT NULL) AND ("user_id" = "auth"."uid"())))));


--
-- Name: inbound_messages Anyone can submit an inbound message; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit an inbound message" ON "public"."inbound_messages" FOR INSERT TO "authenticated", "anon" WITH CHECK (((("char_length"("name") >= 1) AND ("char_length"("name") <= 120)) AND (("char_length"("email") >= 3) AND ("char_length"("email") <= 255)) AND (("char_length"("message") >= 1) AND ("char_length"("message") <= 5000)) AND (("subject" IS NULL) OR ("char_length"("subject") <= 200)) AND (("phone" IS NULL) OR ("char_length"("phone") <= 40)) AND ("status" = 'new'::"public"."inbound_message_status") AND ("read_at" IS NULL) AND ("archived_at" IS NULL)));


--
-- Name: client_navigation_intake Client can insert own intake; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Client can insert own intake" ON "public"."client_navigation_intake" FOR INSERT TO "authenticated" WITH CHECK (("client_id" = "auth"."uid"()));


--
-- Name: client_navigation_intake Client can update own intake; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Client can update own intake" ON "public"."client_navigation_intake" FOR UPDATE TO "authenticated" USING (("client_id" = "auth"."uid"())) WITH CHECK (("client_id" = "auth"."uid"()));


--
-- Name: client_navigation_intake Client can view own intake; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Client can view own intake" ON "public"."client_navigation_intake" FOR SELECT TO "authenticated" USING ((("client_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")));


--
-- Name: appointments Clients delete own appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients delete own appointments" ON "public"."appointments" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "client_id") AND ("auth"."uid"() = "created_by")));


--
-- Name: availability_options Clients delete own availability options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients delete own availability options" ON "public"."availability_options" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "availability_options"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"]))))));


--
-- Name: task_subtasks Clients delete own task subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients delete own task subtasks" ON "public"."task_subtasks" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_subtasks"."parent_task_id") AND ("t"."client_id" = "auth"."uid"())))));


--
-- Name: tasks Clients delete own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients delete own tasks" ON "public"."tasks" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "client_id") AND ("auth"."uid"() = "created_by")));


--
-- Name: messages Clients insert into own thread; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients insert into own thread" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."message_threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."client_id" = "auth"."uid"()))))));


--
-- Name: appointments Clients insert own appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients insert own appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "client_id") AND ("auth"."uid"() = "created_by")));


--
-- Name: availability_options Clients insert own availability options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients insert own availability options" ON "public"."availability_options" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "availability_options"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"]))))));


--
-- Name: documents Clients insert own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients insert own documents" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "client_id") AND ("auth"."uid"() = "uploaded_by") AND ("split_part"("storage_path", '/'::"text", 1) = ("auth"."uid"())::"text") AND ("status" = 'pending_review'::"public"."document_status") AND ("triaged_at" IS NULL) AND ("triaged_by" IS NULL)));


--
-- Name: client_availability_preferences Clients insert own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients insert own preferences" ON "public"."client_availability_preferences" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "client_availability_preferences"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"]))))));


--
-- Name: task_subtasks Clients insert own task subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients insert own task subtasks" ON "public"."task_subtasks" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_subtasks"."parent_task_id") AND ("t"."client_id" = "auth"."uid"()))))));


--
-- Name: tasks Clients insert own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients insert own tasks" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "client_id") AND ("auth"."uid"() = "created_by")));


--
-- Name: payment_note_dismissals Clients manage own dismissals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients manage own dismissals" ON "public"."payment_note_dismissals" TO "authenticated" USING (("auth"."uid"() = "client_id")) WITH CHECK (("auth"."uid"() = "client_id"));


--
-- Name: report_comments Clients post comments on their shared reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients post comments on their shared reports" ON "public"."report_comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND ("author_role" = 'client'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "report_comments"."report_id") AND ("r"."client_id" = "auth"."uid"()) AND ("r"."visibility" = 'shared'::"public"."report_visibility"))))));


--
-- Name: client_payments Clients see own outstanding payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients see own outstanding payments" ON "public"."client_payments" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "client_id") AND ("invoice_given" = true) AND ("paid" = false)));


--
-- Name: availability_requests Clients submit response on own availability request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients submit response on own availability request" ON "public"."availability_requests" FOR UPDATE TO "authenticated" USING ((("client_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"])))) WITH CHECK ((("client_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['waiting_for_client'::"text", 'client_responded'::"text"])) AND ("advocate_id" = ( SELECT "ar"."advocate_id"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND ("appointment_category" = ( SELECT "ar"."appointment_category"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND ("appointment_purpose" = ( SELECT "ar"."appointment_purpose"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND (COALESCE("provider_name", ''::"text") = COALESCE(( SELECT "ar"."provider_name"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id")), ''::"text")) AND (COALESCE("clinic_name", ''::"text") = COALESCE(( SELECT "ar"."clinic_name"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id")), ''::"text")) AND (COALESCE("location", ''::"text") = COALESCE(( SELECT "ar"."location"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id")), ''::"text")) AND ("date_range_start" = ( SELECT "ar"."date_range_start"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND ("date_range_end" = ( SELECT "ar"."date_range_end"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND ("urgency" = ( SELECT "ar"."urgency"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND (NOT ("preferred_appointment_length_minutes" IS DISTINCT FROM ( SELECT "ar"."preferred_appointment_length_minutes"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id")))) AND ("interpreter_needed" = ( SELECT "ar"."interpreter_needed"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND ("telehealth_acceptable" = ( SELECT "ar"."telehealth_acceptable"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND ("in_person_required" = ( SELECT "ar"."in_person_required"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND (COALESCE("transport_considerations", ''::"text") = COALESCE(( SELECT "ar"."transport_considerations"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id")), ''::"text")) AND (COALESCE("advocate_notes", ''::"text") = COALESCE(( SELECT "ar"."advocate_notes"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id")), ''::"text")) AND (COALESCE("client_facing_notes", ''::"text") = COALESCE(( SELECT "ar"."client_facing_notes"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id")), ''::"text")) AND ("created_at" = ( SELECT "ar"."created_at"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))) AND (NOT ("sent_at" IS DISTINCT FROM ( SELECT "ar"."sent_at"
   FROM "public"."availability_requests" "ar"
  WHERE ("ar"."id" = "availability_requests"."id"))))));


--
-- Name: availability_options Clients tick own availability options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients tick own availability options" ON "public"."availability_options" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "availability_options"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "availability_options"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"]))))));


--
-- Name: client_availability_preferences Clients update own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients update own preferences" ON "public"."client_availability_preferences" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "client_availability_preferences"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "client_availability_preferences"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text"]))))));


--
-- Name: task_subtasks Clients update own task subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients update own task subtasks" ON "public"."task_subtasks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_subtasks"."parent_task_id") AND ("t"."client_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_subtasks"."parent_task_id") AND ("t"."client_id" = "auth"."uid"())))));


--
-- Name: tasks Clients update own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients update own tasks" ON "public"."tasks" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "client_id")) WITH CHECK (("auth"."uid"() = "client_id"));


--
-- Name: report_comments Clients view comments on their shared reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view comments on their shared reports" ON "public"."report_comments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "report_comments"."report_id") AND ("r"."client_id" = "auth"."uid"()) AND ("r"."visibility" = 'shared'::"public"."report_visibility")))));


--
-- Name: appointments Clients view own appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "client_id"));


--
-- Name: availability_options Clients view own availability options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own availability options" ON "public"."availability_options" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "availability_options"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text", 'client_responded'::"text", 'ready_to_book'::"text", 'clinic_contacted'::"text", 'appointment_confirmed'::"text"]))))));


--
-- Name: documents Clients view own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own documents" ON "public"."documents" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "client_id") AND ("visibility" = 'shared'::"public"."document_visibility")));


--
-- Name: emotion_logs Clients view own emotion logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own emotion logs" ON "public"."emotion_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: client_availability_preferences Clients view own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own preferences" ON "public"."client_availability_preferences" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."availability_requests" "ar"
  WHERE (("ar"."id" = "client_availability_preferences"."availability_request_id") AND ("ar"."client_id" = "auth"."uid"()) AND ("ar"."status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text", 'client_responded'::"text", 'ready_to_book'::"text", 'clinic_contacted'::"text", 'appointment_confirmed'::"text"]))))));


--
-- Name: client_report_meta Clients view own report meta; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own report meta" ON "public"."client_report_meta" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "client_id"));


--
-- Name: email_change_requests Clients view own self-initiated email change requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own self-initiated email change requests" ON "public"."email_change_requests" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("initiator_role" = 'client'::"text")));


--
-- Name: reports Clients view own shared reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own shared reports" ON "public"."reports" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "client_id") AND ("visibility" = 'shared'::"public"."report_visibility")));


--
-- Name: task_status_events Clients view own task events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own task events" ON "public"."task_status_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "client_id"));


--
-- Name: task_subtasks Clients view own task subtasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own task subtasks" ON "public"."task_subtasks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_subtasks"."parent_task_id") AND ("t"."client_id" = "auth"."uid"())))));


--
-- Name: tasks Clients view own tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own tasks" ON "public"."tasks" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "client_id"));


--
-- Name: message_threads Clients view own thread; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own thread" ON "public"."message_threads" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "client_id"));


--
-- Name: messages Clients view own thread messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own thread messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."message_threads" "t"
  WHERE (("t"."id" = "messages"."thread_id") AND ("t"."client_id" = "auth"."uid"())))));


--
-- Name: availability_requests Clients view own visible availability requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients view own visible availability requests" ON "public"."availability_requests" FOR SELECT TO "authenticated" USING ((("client_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['sent_to_client'::"text", 'waiting_for_client'::"text", 'client_responded'::"text", 'ready_to_book'::"text", 'clinic_contacted'::"text", 'appointment_confirmed'::"text"]))));


--
-- Name: user_roles Deny delete from user_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deny delete from user_roles" ON "public"."user_roles" FOR DELETE TO "authenticated", "anon" USING (false);


--
-- Name: user_roles Deny insert to user_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deny insert to user_roles" ON "public"."user_roles" FOR INSERT TO "authenticated", "anon" WITH CHECK (false);


--
-- Name: user_roles Deny update to user_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Deny update to user_roles" ON "public"."user_roles" FOR UPDATE TO "authenticated", "anon" USING (false) WITH CHECK (false);


--
-- Name: email_send_log Service role can insert send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert send log" ON "public"."email_send_log" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: suppressed_emails Service role can insert suppressed emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert suppressed emails" ON "public"."suppressed_emails" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: email_unsubscribe_tokens Service role can insert tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert tokens" ON "public"."email_unsubscribe_tokens" FOR INSERT WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: email_send_state Service role can manage send state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage send state" ON "public"."email_send_state" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: email_unsubscribe_tokens Service role can mark tokens as used; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can mark tokens as used" ON "public"."email_unsubscribe_tokens" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: email_send_log Service role can read send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read send log" ON "public"."email_send_log" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: suppressed_emails Service role can read suppressed emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read suppressed emails" ON "public"."suppressed_emails" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: email_unsubscribe_tokens Service role can read tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read tokens" ON "public"."email_unsubscribe_tokens" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: email_send_log Service role can update send log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update send log" ON "public"."email_send_log" FOR UPDATE USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: push_subscriptions Signed-in users can claim push endpoint; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Signed-in users can claim push endpoint" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: push_subscriptions Signed-in users can resolve push endpoint conflicts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Signed-in users can resolve push endpoint conflicts" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));


--
-- Name: client_consents Users can insert their own consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own consents" ON "public"."client_consents" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("email" = ( SELECT "p"."email"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))) AND ("tier" = ( SELECT "p"."tier"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))) AND ("report_status" = ( SELECT "p"."report_status"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))) AND ("client_colour" = ( SELECT "p"."client_colour"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))) AND ("payment_status" = ( SELECT "p"."payment_status"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))) AND ("client_progress" = ( SELECT "p"."client_progress"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))) AND ("must_change_password" = ( SELECT "p"."must_change_password"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))) AND (NOT ("activated_at" IS DISTINCT FROM ( SELECT "p"."activated_at"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "profiles"."id"))))));


--
-- Name: client_consents Users can view their own consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own consents" ON "public"."client_consents" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: notifications Users delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: push_subscriptions Users delete own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own push subs" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: mfa_recovery_codes Users delete own recovery codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own recovery codes" ON "public"."mfa_recovery_codes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: trusted_devices Users delete own trusted devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own trusted devices" ON "public"."trusted_devices" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: notification_settings Users insert own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own notification settings" ON "public"."notification_settings" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: push_subscriptions Users insert own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own push subs" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: mfa_recovery_codes Users insert own recovery codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own recovery codes" ON "public"."mfa_recovery_codes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: trusted_devices Users insert own trusted devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own trusted devices" ON "public"."trusted_devices" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND (COALESCE(("auth"."jwt"() ->> 'aal'::"text"), ''::"text") = 'aal2'::"text")));


--
-- Name: push_subscriptions Users select own push subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users select own push subs" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: notification_settings Users update own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notification settings" ON "public"."notification_settings" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: notifications Users update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: mfa_recovery_codes Users update own recovery codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own recovery codes" ON "public"."mfa_recovery_codes" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: trusted_devices Users update own trusted devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own trusted devices" ON "public"."trusted_devices" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND (COALESCE(("auth"."jwt"() ->> 'aal'::"text"), ''::"text") = 'aal2'::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") AND (COALESCE(("auth"."jwt"() ->> 'aal'::"text"), ''::"text") = 'aal2'::"text")));


--
-- Name: message_notification_log Users view own message notification log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own message notification log" ON "public"."message_notification_log" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: notification_settings Users view own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own notification settings" ON "public"."notification_settings" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: notifications Users view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: agreement_documents active agreements readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active agreements readable" ON "public"."agreement_documents" FOR SELECT TO "authenticated", "anon" USING (("active" = true));


--
-- Name: client_agreement_acceptances advocates manage acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "advocates manage acceptances" ON "public"."client_agreement_acceptances" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: agreement_documents advocates manage agreements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "advocates manage agreements" ON "public"."agreement_documents" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'advocate'::"public"."app_role"));


--
-- Name: agreement_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."agreement_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_notification_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."appointment_notification_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;

--
-- Name: attention_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."attention_signals" ENABLE ROW LEVEL SECURITY;

--
-- Name: availability_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."availability_options" ENABLE ROW LEVEL SECURITY;

--
-- Name: availability_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."availability_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_agreement_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_agreement_acceptances" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_availability_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_availability_preferences" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_cases" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_consents" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_fee_arrangements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_fee_arrangements" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_internal_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_internal_notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_navigation_intake; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_navigation_intake" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_report_meta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."client_report_meta" ENABLE ROW LEVEL SECURITY;

--
-- Name: client_agreement_acceptances clients insert own acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients insert own acceptances" ON "public"."client_agreement_acceptances" FOR INSERT TO "authenticated" WITH CHECK (("client_id" = "auth"."uid"()));


--
-- Name: client_agreement_acceptances clients see own acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients see own acceptances" ON "public"."client_agreement_acceptances" FOR SELECT TO "authenticated" USING (("client_id" = "auth"."uid"()));


--
-- Name: clinic_contact_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."clinic_contact_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: document_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."document_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_change_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_send_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_send_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_send_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribe_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."email_unsubscribe_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: emotion_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."emotion_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: inbound_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."inbound_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_notification_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."message_notification_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."message_threads" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_recovery_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_note_dismissals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_note_dismissals" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_reminders_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_reminders_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payment_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: report_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."report_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: suppressed_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."suppressed_emails" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_status_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."task_status_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_subtasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."task_subtasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_attachments thread members read attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "thread members read attachments" ON "public"."message_attachments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."message_threads" "t"
  WHERE (("t"."id" = "message_attachments"."thread_id") AND (("t"."client_id" = "auth"."uid"()) OR ("t"."advocate_id" = "auth"."uid"()))))));


--
-- Name: trusted_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trusted_devices" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_attachments uploader inserts own attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "uploader inserts own attachments" ON "public"."message_attachments" FOR INSERT TO "authenticated" WITH CHECK ((("uploader_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."message_threads" "t"
  WHERE (("t"."id" = "message_attachments"."thread_id") AND (("t"."client_id" = "auth"."uid"()) OR ("t"."advocate_id" = "auth"."uid"())))))));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "_primary_advocate_id"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."_primary_advocate_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_primary_advocate_id"() TO "service_role";


--
-- Name: FUNCTION "admin_delete_client"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_delete_client"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_client"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_delete_client"("_user_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "agree_report"("_report_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."agree_report"("_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agree_report"("_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agree_report"("_report_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "availability_requests_status_guard"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."availability_requests_status_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."availability_requests_status_guard"() TO "service_role";


--
-- Name: FUNCTION "availability_requests_touch"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."availability_requests_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."availability_requests_touch"() TO "service_role";


--
-- Name: FUNCTION "bump_client_progress"("_client_id" "uuid", "_delta" integer, "_cap" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."bump_client_progress"("_client_id" "uuid", "_delta" integer, "_cap" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_client_progress"("_client_id" "uuid", "_delta" integer, "_cap" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_client_progress"("_client_id" "uuid", "_delta" integer, "_cap" integer) TO "service_role";


--
-- Name: FUNCTION "bump_thread_last_message_at"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."bump_thread_last_message_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_thread_last_message_at"() TO "service_role";


--
-- Name: FUNCTION "calculate_client_urgency"("p_client_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."calculate_client_urgency"("p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_client_urgency"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_client_urgency"("p_client_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "client_availability_preferences_touch"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."client_availability_preferences_touch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_availability_preferences_touch"() TO "service_role";


--
-- Name: FUNCTION "client_cases_auto_close"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."client_cases_auto_close"() TO "anon";
GRANT ALL ON FUNCTION "public"."client_cases_auto_close"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_cases_auto_close"() TO "service_role";


--
-- Name: FUNCTION "client_cases_sync_next_action_task"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."client_cases_sync_next_action_task"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_cases_sync_next_action_task"() TO "service_role";


--
-- Name: FUNCTION "clinic_contact_logs_stamp"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."clinic_contact_logs_stamp"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinic_contact_logs_stamp"() TO "service_role";


--
-- Name: FUNCTION "count_my_active_recovery_codes"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."count_my_active_recovery_codes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."count_my_active_recovery_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_my_active_recovery_codes"() TO "service_role";


--
-- Name: FUNCTION "create_overdue_task_reminders"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."create_overdue_task_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_overdue_task_reminders"() TO "service_role";


--
-- Name: FUNCTION "create_task_on_new_enquiry"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."create_task_on_new_enquiry"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_task_on_new_enquiry"() TO "service_role";


--
-- Name: FUNCTION "delete_email"("queue_name" "text", "message_id" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_email"("queue_name" "text", "message_id" bigint) TO "service_role";


--
-- Name: FUNCTION "enqueue_email"("queue_name" "text", "payload" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_email"("queue_name" "text", "payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "ensure_message_thread_for_client"("_client_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ensure_message_thread_for_client"("_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_message_thread_for_client"("_client_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "find_my_trusted_device"("_token_hash" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."find_my_trusted_device"("_token_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_my_trusted_device"("_token_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_my_trusted_device"("_token_hash" "text") TO "service_role";


--
-- Name: FUNCTION "get_advocate_dashboard_counts"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."get_advocate_dashboard_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_advocate_dashboard_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_advocate_dashboard_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_advocate_dashboard_counts"() TO "service_role";


--
-- Name: FUNCTION "get_advocate_notes"("_request_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."get_advocate_notes"("_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_advocate_notes"("_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_advocate_notes"("_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_appointment_private_notes_map"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."get_appointment_private_notes_map"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_appointment_private_notes_map"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_appointment_private_notes_map"() TO "service_role";


--
-- Name: FUNCTION "get_client_crm_summary"("p_client_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."get_client_crm_summary"("p_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_crm_summary"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_client_crm_summary"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_crm_summary"("p_client_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_client_emotion_summary"("_client_id" "uuid", "_days" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."get_client_emotion_summary"("_client_id" "uuid", "_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_emotion_summary"("_client_id" "uuid", "_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_emotion_summary"("_client_id" "uuid", "_days" integer) TO "service_role";


--
-- Name: FUNCTION "get_my_advocate"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."get_my_advocate"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_advocate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_advocate"() TO "service_role";


--
-- Name: FUNCTION "get_recent_low_mood_rows"("_days" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."get_recent_low_mood_rows"("_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_recent_low_mood_rows"("_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_low_mood_rows"("_days" integer) TO "service_role";


--
-- Name: FUNCTION "guard_profile_advocate_fields"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."guard_profile_advocate_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_profile_advocate_fields"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "has_role"("_user_id" "uuid", "_role" "public"."app_role"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";


--
-- Name: FUNCTION "invalidate_user_auth_tokens"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."invalidate_user_auth_tokens"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invalidate_user_auth_tokens"("_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "list_my_trusted_devices"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."list_my_trusted_devices"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_trusted_devices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_trusted_devices"() TO "service_role";


--
-- Name: FUNCTION "log_task_status_event"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."log_task_status_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_task_status_event"() TO "service_role";


--
-- Name: FUNCTION "mark_all_notifications_read"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."mark_all_notifications_read"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_all_notifications_read"() TO "service_role";


--
-- Name: FUNCTION "mark_notification_read"("_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."mark_notification_read"("_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_read"("_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "mark_thread_read"("_thread_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."mark_thread_read"("_thread_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_thread_read"("_thread_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_thread_read"("_thread_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_to_dlq"("source_queue" "text", "dlq_name" "text", "message_id" bigint, "payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "process_auto_advocate_tasks"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."process_auto_advocate_tasks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_auto_advocate_tasks"() TO "service_role";


--
-- Name: FUNCTION "read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_email_batch"("queue_name" "text", "batch_size" integer, "vt" integer) TO "service_role";


--
-- Name: FUNCTION "recalculate_all_active_client_urgency"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."recalculate_all_active_client_urgency"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_all_active_client_urgency"() TO "service_role";


--
-- Name: FUNCTION "recompute_client_progress"("_client_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."recompute_client_progress"("_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recompute_client_progress"("_client_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "reset_report_progress"("_client_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."reset_report_progress"("_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_report_progress"("_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_report_progress"("_client_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "revert_report_to_draft"("_report_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."revert_report_to_draft"("_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revert_report_to_draft"("_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_report_to_draft"("_report_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "send_back_report"("_report_id" "uuid", "_note" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."send_back_report"("_report_id" "uuid", "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_back_report"("_report_id" "uuid", "_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_back_report"("_report_id" "uuid", "_note" "text") TO "service_role";


--
-- Name: FUNCTION "set_message_sender_role"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."set_message_sender_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_message_sender_role"() TO "service_role";


--
-- Name: FUNCTION "set_report_comment_author_role"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."set_report_comment_author_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_report_comment_author_role"() TO "service_role";


--
-- Name: FUNCTION "set_report_stage_visibility"("_report_id" "uuid", "_stage" "public"."report_stage", "_visibility" "public"."report_visibility"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."set_report_stage_visibility"("_report_id" "uuid", "_stage" "public"."report_stage", "_visibility" "public"."report_visibility") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_report_stage_visibility"("_report_id" "uuid", "_stage" "public"."report_stage", "_visibility" "public"."report_visibility") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_report_stage_visibility"("_report_id" "uuid", "_stage" "public"."report_stage", "_visibility" "public"."report_visibility") TO "service_role";


--
-- Name: FUNCTION "share_report_for_review"("_report_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."share_report_for_review"("_report_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."share_report_for_review"("_report_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."share_report_for_review"("_report_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "touch_client_cases_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."touch_client_cases_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_client_cases_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_client_cases_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_client_internal_notes"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."touch_client_internal_notes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_client_internal_notes"() TO "service_role";


--
-- Name: FUNCTION "touch_client_navigation_intake"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."touch_client_navigation_intake"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_client_navigation_intake"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_client_navigation_intake"() TO "service_role";


--
-- Name: FUNCTION "touch_client_report_meta"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."touch_client_report_meta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_client_report_meta"() TO "service_role";


--
-- Name: FUNCTION "touch_inbound_messages_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."touch_inbound_messages_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_inbound_messages_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_inbound_messages_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_payment_row"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."touch_payment_row"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_payment_row"() TO "service_role";


--
-- Name: FUNCTION "touch_reports_updated_at"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."touch_reports_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_reports_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_task_subtasks_updated_at"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."touch_task_subtasks_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_task_subtasks_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trg_auto_task_appt_attended"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_auto_task_appt_attended"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_auto_task_appt_attended"() TO "service_role";


--
-- Name: FUNCTION "trg_auto_task_appt_created"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_auto_task_appt_created"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_auto_task_appt_created"() TO "service_role";


--
-- Name: FUNCTION "trg_auto_task_client_activated"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_auto_task_client_activated"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_auto_task_client_activated"() TO "service_role";


--
-- Name: FUNCTION "trg_auto_task_doc_uploaded"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_auto_task_doc_uploaded"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_auto_task_doc_uploaded"() TO "service_role";


--
-- Name: FUNCTION "trg_auto_task_report_feedback"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_auto_task_report_feedback"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_auto_task_report_feedback"() TO "service_role";


--
-- Name: FUNCTION "trg_profile_activation_thread"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_profile_activation_thread"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_profile_activation_thread"() TO "service_role";


--
-- Name: FUNCTION "trg_recompute_appointments"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_recompute_appointments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_recompute_appointments"() TO "service_role";


--
-- Name: FUNCTION "trg_recompute_documents"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_recompute_documents"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_recompute_documents"() TO "service_role";


--
-- Name: FUNCTION "trg_recompute_tasks"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_recompute_tasks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_recompute_tasks"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_appointments"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_appointments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_appointments"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_client_cases"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_client_cases"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_client_cases"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_client_payments"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_client_payments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_client_payments"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_client_report_meta"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_client_report_meta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_client_report_meta"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_documents"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_documents"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_documents"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_emotion_logs"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_emotion_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_emotion_logs"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_messages"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_messages"() TO "service_role";


--
-- Name: FUNCTION "trg_urgency_reports"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."trg_urgency_reports"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_urgency_reports"() TO "service_role";


--
-- Name: FUNCTION "upsert_my_push_subscription"("_endpoint" "text", "_keys" "jsonb", "_user_agent" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."upsert_my_push_subscription"("_endpoint" "text", "_keys" "jsonb", "_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_my_push_subscription"("_endpoint" "text", "_keys" "jsonb", "_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_my_push_subscription"("_endpoint" "text", "_keys" "jsonb", "_user_agent" "text") TO "service_role";


--
-- Name: TABLE "agreement_documents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."agreement_documents" TO "anon";
GRANT ALL ON TABLE "public"."agreement_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."agreement_documents" TO "service_role";


--
-- Name: TABLE "appointment_notification_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."appointment_notification_log" TO "anon";
GRANT ALL ON TABLE "public"."appointment_notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_notification_log" TO "service_role";


--
-- Name: TABLE "appointments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";


--
-- Name: TABLE "attention_signals"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."attention_signals" TO "anon";
GRANT ALL ON TABLE "public"."attention_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."attention_signals" TO "service_role";


--
-- Name: TABLE "availability_options"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."availability_options" TO "anon";
GRANT ALL ON TABLE "public"."availability_options" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_options" TO "service_role";


--
-- Name: TABLE "availability_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."availability_requests" TO "anon";
GRANT ALL ON TABLE "public"."availability_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_requests" TO "service_role";


--
-- Name: COLUMN "availability_requests"."id"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("id") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."client_id"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("client_id") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."advocate_id"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("advocate_id") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."appointment_category"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("appointment_category") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."appointment_purpose"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("appointment_purpose") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."provider_name"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("provider_name") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."clinic_name"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("clinic_name") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."location"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("location") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."date_range_start"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("date_range_start") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."date_range_end"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("date_range_end") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."urgency"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("urgency") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."preferred_appointment_length_minutes"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("preferred_appointment_length_minutes") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."status"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("status") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."interpreter_needed"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("interpreter_needed") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."telehealth_acceptable"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("telehealth_acceptable") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."in_person_required"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("in_person_required") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."transport_considerations"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("transport_considerations") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."client_facing_notes"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("client_facing_notes") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."created_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("created_at") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."updated_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("updated_at") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."sent_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("sent_at") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: COLUMN "availability_requests"."client_responded_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("client_responded_at") ON TABLE "public"."availability_requests" TO "authenticated";


--
-- Name: TABLE "client_agreement_acceptances"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_agreement_acceptances" TO "anon";
GRANT ALL ON TABLE "public"."client_agreement_acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."client_agreement_acceptances" TO "service_role";


--
-- Name: TABLE "client_availability_preferences"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_availability_preferences" TO "anon";
GRANT ALL ON TABLE "public"."client_availability_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."client_availability_preferences" TO "service_role";


--
-- Name: TABLE "client_cases"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_cases" TO "anon";
GRANT ALL ON TABLE "public"."client_cases" TO "authenticated";
GRANT ALL ON TABLE "public"."client_cases" TO "service_role";


--
-- Name: TABLE "client_consents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_consents" TO "anon";
GRANT ALL ON TABLE "public"."client_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."client_consents" TO "service_role";


--
-- Name: TABLE "client_fee_arrangements"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_fee_arrangements" TO "anon";
GRANT ALL ON TABLE "public"."client_fee_arrangements" TO "authenticated";
GRANT ALL ON TABLE "public"."client_fee_arrangements" TO "service_role";


--
-- Name: TABLE "client_internal_notes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_internal_notes" TO "anon";
GRANT ALL ON TABLE "public"."client_internal_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."client_internal_notes" TO "service_role";


--
-- Name: TABLE "client_navigation_intake"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_navigation_intake" TO "anon";
GRANT ALL ON TABLE "public"."client_navigation_intake" TO "authenticated";
GRANT ALL ON TABLE "public"."client_navigation_intake" TO "service_role";


--
-- Name: TABLE "client_payments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_payments" TO "anon";
GRANT ALL ON TABLE "public"."client_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."client_payments" TO "service_role";


--
-- Name: TABLE "client_report_meta"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."client_report_meta" TO "anon";
GRANT ALL ON TABLE "public"."client_report_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."client_report_meta" TO "service_role";


--
-- Name: TABLE "clinic_contact_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."clinic_contact_logs" TO "anon";
GRANT ALL ON TABLE "public"."clinic_contact_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_contact_logs" TO "service_role";


--
-- Name: TABLE "document_templates"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."document_templates" TO "anon";
GRANT ALL ON TABLE "public"."document_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."document_templates" TO "service_role";


--
-- Name: TABLE "documents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";


--
-- Name: TABLE "email_change_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."email_change_requests" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."email_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."email_change_requests" TO "service_role";


--
-- Name: COLUMN "email_change_requests"."id"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("id") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."user_id"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("user_id") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."old_email"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("old_email") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."new_email"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("new_email") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."initiated_by"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("initiated_by") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."initiator_role"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("initiator_role") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."status"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("status") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."created_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("created_at") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."expires_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("expires_at") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."verified_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("verified_at") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: COLUMN "email_change_requests"."cancelled_at"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT("cancelled_at") ON TABLE "public"."email_change_requests" TO "authenticated";


--
-- Name: TABLE "email_send_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."email_send_log" TO "anon";
GRANT ALL ON TABLE "public"."email_send_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_log" TO "service_role";


--
-- Name: TABLE "email_send_state"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."email_send_state" TO "anon";
GRANT ALL ON TABLE "public"."email_send_state" TO "authenticated";
GRANT ALL ON TABLE "public"."email_send_state" TO "service_role";


--
-- Name: TABLE "email_unsubscribe_tokens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "anon";
GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."email_unsubscribe_tokens" TO "service_role";


--
-- Name: TABLE "emotion_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."emotion_logs" TO "anon";
GRANT ALL ON TABLE "public"."emotion_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."emotion_logs" TO "service_role";


--
-- Name: TABLE "inbound_messages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."inbound_messages" TO "anon";
GRANT ALL ON TABLE "public"."inbound_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_messages" TO "service_role";


--
-- Name: TABLE "message_attachments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."message_attachments" TO "service_role";


--
-- Name: TABLE "message_notification_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."message_notification_log" TO "anon";
GRANT ALL ON TABLE "public"."message_notification_log" TO "authenticated";
GRANT ALL ON TABLE "public"."message_notification_log" TO "service_role";


--
-- Name: TABLE "message_threads"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."message_threads" TO "anon";
GRANT ALL ON TABLE "public"."message_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_threads" TO "service_role";


--
-- Name: TABLE "messages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";


--
-- Name: TABLE "mfa_recovery_codes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "anon";
GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "service_role";


--
-- Name: TABLE "notification_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "payment_note_dismissals"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payment_note_dismissals" TO "anon";
GRANT ALL ON TABLE "public"."payment_note_dismissals" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_note_dismissals" TO "service_role";


--
-- Name: TABLE "payment_reminders_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payment_reminders_log" TO "anon";
GRANT ALL ON TABLE "public"."payment_reminders_log" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_reminders_log" TO "service_role";


--
-- Name: TABLE "payment_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payment_settings" TO "anon";
GRANT ALL ON TABLE "public"."payment_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_settings" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "push_subscriptions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";


--
-- Name: TABLE "report_comments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."report_comments" TO "anon";
GRANT ALL ON TABLE "public"."report_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."report_comments" TO "service_role";


--
-- Name: TABLE "reports"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";


--
-- Name: TABLE "suppressed_emails"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."suppressed_emails" TO "anon";
GRANT ALL ON TABLE "public"."suppressed_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."suppressed_emails" TO "service_role";


--
-- Name: TABLE "task_status_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."task_status_events" TO "anon";
GRANT ALL ON TABLE "public"."task_status_events" TO "authenticated";
GRANT ALL ON TABLE "public"."task_status_events" TO "service_role";


--
-- Name: TABLE "task_subtasks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."task_subtasks" TO "anon";
GRANT ALL ON TABLE "public"."task_subtasks" TO "authenticated";
GRANT ALL ON TABLE "public"."task_subtasks" TO "service_role";


--
-- Name: TABLE "tasks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";


--
-- Name: TABLE "trusted_devices"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."trusted_devices" TO "anon";
GRANT ALL ON TABLE "public"."trusted_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."trusted_devices" TO "service_role";


--
-- Name: TABLE "user_roles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

\unrestrict ueKryOHttGE22DkNNEv4Gp8WaEx6an6my1Lc3pAWeYginengkt1uC2mr8BYTCq9

