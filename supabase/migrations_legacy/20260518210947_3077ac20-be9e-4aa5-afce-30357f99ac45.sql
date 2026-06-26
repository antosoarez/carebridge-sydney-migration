
-- Update outcome check to 4 values; migrate legacy 'missed' first
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_outcome_check;
UPDATE public.appointments SET outcome = 'cancelled_missed' WHERE outcome = 'missed';
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_outcome_check
  CHECK (outcome IN ('scheduled','attended','rescheduled','cancelled_missed'));

-- Deterministic recompute of a single client's engagement bar
CREATE OR REPLACE FUNCTION public.recompute_client_progress(_client_id uuid)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attended_pts int := 0;
  missed_pts int := 0;
  docs_pts int := 0;
  tasks_pts int := 0;
  total int := 0;
BEGIN
  IF _client_id IS NULL THEN RETURN 0; END IF;

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
  RETURN total::smallint;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_client_progress(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.recompute_client_progress(uuid) TO authenticated;

-- Triggers: any change to appointments / tasks / documents recomputes the affected client
CREATE OR REPLACE FUNCTION public.trg_recompute_appointments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.trg_recompute_tasks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.trg_recompute_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS appointments_recompute_progress ON public.appointments;
CREATE TRIGGER appointments_recompute_progress
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_appointments();

DROP TRIGGER IF EXISTS tasks_recompute_progress ON public.tasks;
CREATE TRIGGER tasks_recompute_progress
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_tasks();

DROP TRIGGER IF EXISTS documents_recompute_progress ON public.documents;
CREATE TRIGGER documents_recompute_progress
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_documents();

-- Baseline: recompute every client now so old ad-hoc bumps are corrected
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = 'client' LOOP
    PERFORM public.recompute_client_progress(r.user_id);
  END LOOP;
END $$;
