
-- Lock down SECURITY DEFINER functions: revoke from PUBLIC/anon, grant only where needed.

-- Trigger-only / internal functions: revoke from everyone (triggers run regardless).
DO $$
DECLARE
  fn text;
  trigger_only text[] := ARRAY[
    'touch_task_subtasks_updated_at()',
    'log_task_status_event()',
    'handle_new_user()',
    'bump_thread_last_message_at()',
    'trg_profile_activation_thread()',
    'set_message_sender_role()',
    'guard_profile_advocate_fields()',
    'clinic_contact_logs_stamp()',
    'availability_requests_touch()',
    'client_availability_preferences_touch()',
    'availability_requests_status_guard()',
    'touch_payment_row()',
    'touch_reports_updated_at()',
    'trg_recompute_appointments()',
    'trg_recompute_tasks()',
    'trg_recompute_documents()',
    'touch_client_report_meta()',
    'set_report_comment_author_role()',
    'touch_client_internal_notes()',
    'recompute_client_progress(uuid)',
    'ensure_message_thread_for_client(uuid)',
    'invalidate_user_auth_tokens(uuid)',
    'enqueue_email(text, jsonb)',
    'delete_email(text, bigint)',
    'read_email_batch(text, integer, integer)',
    'move_to_dlq(text, text, bigint, jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_only LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- User-callable RPCs: revoke from anon, grant to authenticated only.
DO $$
DECLARE
  fn text;
  user_rpcs text[] := ARRAY[
    'bump_client_progress(uuid, integer, integer)',
    'has_role(uuid, app_role)',
    'get_client_emotion_summary(uuid, integer)',
    'get_recent_low_mood_rows(integer)',
    'send_back_report(uuid, text)',
    'get_my_advocate()',
    'get_advocate_notes(uuid)',
    'mark_thread_read(uuid)',
    'mark_all_notifications_read()',
    'mark_notification_read(uuid)',
    'set_report_stage_visibility(uuid, report_stage, report_visibility)',
    'share_report_for_review(uuid)',
    'agree_report(uuid)',
    'revert_report_to_draft(uuid)',
    'reset_report_progress(uuid)',
    'admin_delete_client(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY user_rpcs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;
