
-- 1. Table
CREATE TABLE public.client_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_title text NOT NULL,
  service_type text NOT NULL,
  case_status text NOT NULL DEFAULT 'New',
  tier text NULL,
  payment_state text NULL,
  primary_goal text NULL,
  main_advocacy_area text NULL,
  complexity_level text NULL,
  next_action text NULL,
  next_action_due_at timestamptz NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_cases_case_status_chk CHECK (case_status IN (
    'New','Discovery','Agreement pending','Payment pending','In progress',
    'Waiting on client','Waiting on clinic','Follow-up required',
    'Completed','Ongoing support','Closed'
  )),
  CONSTRAINT client_cases_service_type_chk CHECK (service_type IN (
    'Appointment preparation','Appointment attendance','Health admin support',
    'Document organisation','Care coordination','Report preparation',
    'Ongoing advocacy support','Other'
  )),
  CONSTRAINT client_cases_complexity_chk CHECK (
    complexity_level IS NULL OR complexity_level IN ('Simple','Moderate','Complex')
  ),
  CONSTRAINT client_cases_payment_state_chk CHECK (
    payment_state IS NULL OR payment_state IN (
      'Unpaid','Deposit paid','Partially paid','Paid','Overdue','Waived','N/A'
    )
  )
);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_cases TO authenticated;
GRANT ALL ON public.client_cases TO service_role;

-- 3. RLS
ALTER TABLE public.client_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates select client_cases"
  ON public.client_cases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert client_cases"
  ON public.client_cases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advocate') AND created_by = auth.uid());

CREATE POLICY "Advocates update client_cases"
  ON public.client_cases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete client_cases"
  ON public.client_cases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- 4. Indexes
CREATE INDEX idx_client_cases_client_id ON public.client_cases(client_id);
CREATE INDEX idx_client_cases_status    ON public.client_cases(case_status);
CREATE INDEX idx_client_cases_client_opened ON public.client_cases(client_id, opened_at DESC);

-- 5. updated_at touch
CREATE OR REPLACE FUNCTION public.touch_client_cases_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_client_cases_touch
BEFORE UPDATE ON public.client_cases
FOR EACH ROW EXECUTE FUNCTION public.touch_client_cases_updated_at();

-- 6. Auto-close trigger
CREATE OR REPLACE FUNCTION public.client_cases_auto_close()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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

CREATE TRIGGER trg_client_cases_auto_close
BEFORE INSERT OR UPDATE OF case_status ON public.client_cases
FOR EACH ROW EXECUTE FUNCTION public.client_cases_auto_close();

-- 7. Sync next_action -> tasks (deduped per case)
CREATE OR REPLACE FUNCTION public.client_cases_sync_next_action_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE TRIGGER trg_client_cases_sync_task
AFTER INSERT OR UPDATE ON public.client_cases
FOR EACH ROW EXECUTE FUNCTION public.client_cases_sync_next_action_task();
