
CREATE TYPE public.task_status AS ENUM ('to_do', 'complete');

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'to_do',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Advocates view all tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advocate') AND created_by = auth.uid());

CREATE POLICY "Advocates update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));
