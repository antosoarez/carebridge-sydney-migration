-- Fix: allow trigger-driven recompute to update profiles.client_progress
-- without weakening the advocate-only guard for any other write path.

CREATE OR REPLACE FUNCTION public.recompute_client_progress(_client_id uuid)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.guard_profile_advocate_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow trigger-driven recompute to write client_progress.
  -- The flag is only set inside public.recompute_client_progress (SECURITY DEFINER)
  -- and is cleared immediately after, so it cannot be spoofed by a client UPDATE.
  IF current_setting('app.recomputing_progress', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.report_status IS DISTINCT FROM OLD.report_status
       OR NEW.client_colour IS DISTINCT FROM OLD.client_colour
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.client_progress IS DISTINCT FROM OLD.client_progress THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, client_colour, payment_status, or client_progress';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;