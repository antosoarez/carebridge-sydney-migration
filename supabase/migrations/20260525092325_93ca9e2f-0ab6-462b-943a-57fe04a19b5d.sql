-- Event log for task status changes — powers honest Care Journey entries
CREATE TABLE IF NOT EXISTS public.task_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  client_id uuid NOT NULL,
  from_status public.task_status,
  to_status public.task_status NOT NULL,
  title_snapshot text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_status_events_client_at_idx
  ON public.task_status_events (client_id, at DESC);

ALTER TABLE public.task_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own task events"
  ON public.task_status_events FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Advocates view all task events"
  ON public.task_status_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'::public.app_role));

-- No INSERT/UPDATE/DELETE policies → only the SECURITY DEFINER trigger writes.

CREATE OR REPLACE FUNCTION public.log_task_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_log_task_status_event ON public.tasks;
CREATE TRIGGER trg_log_task_status_event
  AFTER INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_status_event();

-- Backfill existing completed tasks (one event each) so the timeline still shows history
INSERT INTO public.task_status_events (task_id, client_id, from_status, to_status, title_snapshot, at)
SELECT t.id, t.client_id, NULL, 'complete'::public.task_status, t.title,
       COALESCE(t.completed_at, t.created_at)
  FROM public.tasks t
 WHERE t.status = 'complete'
   AND NOT EXISTS (
     SELECT 1 FROM public.task_status_events e
      WHERE e.task_id = t.id AND e.to_status = 'complete'
   );
