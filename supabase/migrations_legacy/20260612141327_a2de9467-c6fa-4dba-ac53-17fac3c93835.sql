
-- =========================================================================
-- Phase 4: Dashboard counts + per-client CRM summary (advocate-only)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_advocate_dashboard_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.get_advocate_dashboard_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_advocate_dashboard_counts() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_client_crm_summary(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.get_client_crm_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_crm_summary(uuid) TO authenticated;
