
CREATE TABLE public.task_subtasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_subtasks_parent ON public.task_subtasks(parent_task_id, sort_order);

ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;

-- Advocates: full access
CREATE POLICY "Advocates view all subtasks"
  ON public.task_subtasks FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert subtasks"
  ON public.task_subtasks FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advocate') AND created_by = auth.uid());

CREATE POLICY "Advocates update subtasks"
  ON public.task_subtasks FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete subtasks"
  ON public.task_subtasks FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- Clients: only on their own tasks
CREATE POLICY "Clients view own task subtasks"
  ON public.task_subtasks FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_subtasks.parent_task_id AND t.client_id = auth.uid()
  ));

CREATE POLICY "Clients insert own task subtasks"
  ON public.task_subtasks FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_subtasks.parent_task_id AND t.client_id = auth.uid()
    )
  );

CREATE POLICY "Clients update own task subtasks"
  ON public.task_subtasks FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_subtasks.parent_task_id AND t.client_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_subtasks.parent_task_id AND t.client_id = auth.uid()
  ));

CREATE POLICY "Clients delete own task subtasks"
  ON public.task_subtasks FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_subtasks.parent_task_id AND t.client_id = auth.uid()
  ));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_task_subtasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_task_subtasks_updated_at
BEFORE UPDATE ON public.task_subtasks
FOR EACH ROW
EXECUTE FUNCTION public.touch_task_subtasks_updated_at();
