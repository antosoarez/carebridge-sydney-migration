
-- Enable pg_cron and pg_net for scheduled overdue reminders
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function: scan advocate-owned tasks that are overdue and create dedup'd reminder tasks.
-- Advocate tasks = tasks whose client_id is an advocate user_id (matches existing pattern,
-- e.g. enquiry-reply tasks filed under the advocate's own profile).
CREATE OR REPLACE FUNCTION public.create_overdue_task_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Schedule it hourly. Unschedule any prior job with this name first.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job WHERE jobname = 'overdue-task-reminders-hourly';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'overdue-task-reminders-hourly',
  '0 * * * *',
  $cron$ SELECT public.create_overdue_task_reminders(); $cron$
);
