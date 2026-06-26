ALTER TABLE public.tasks ADD COLUMN due_date date;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date) WHERE status = 'to_do';