
-- Add optional scheduling/reminder fields + a priority flag to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_time timestamptz NULL,
  ADD COLUMN IF NOT EXISTS time_block_end timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tasks_reminder_at_idx ON public.tasks (reminder_at)
  WHERE reminder_at IS NOT NULL AND reminder_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_due_time_idx ON public.tasks (due_time) WHERE due_time IS NOT NULL;

-- Allow users to insert/delete their own to-dos (client_id = themselves).
-- Advocates already have full insert/delete via existing policies; this extends
-- the same right to clients for their own tasks, keeping RLS strict.
DROP POLICY IF EXISTS "Clients insert own tasks" ON public.tasks;
CREATE POLICY "Clients insert own tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = client_id AND auth.uid() = created_by);

DROP POLICY IF EXISTS "Clients delete own tasks" ON public.tasks;
CREATE POLICY "Clients delete own tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (auth.uid() = client_id AND auth.uid() = created_by);

-- Realtime so Today's Focus + Calendar refresh instantly when a task is added/completed.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
