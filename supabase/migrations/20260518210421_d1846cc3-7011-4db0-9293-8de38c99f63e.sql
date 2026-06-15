
-- Appointment outcome (attended / missed / scheduled)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'scheduled';

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_outcome_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_outcome_check
  CHECK (outcome IN ('scheduled','attended','missed'));

-- Allow clients to create their own appointments
DROP POLICY IF EXISTS "Clients insert own appointments" ON public.appointments;
CREATE POLICY "Clients insert own appointments"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = client_id AND auth.uid() = created_by);

-- Allow clients to delete their own appointments (so they can remove ones they added)
DROP POLICY IF EXISTS "Clients delete own appointments" ON public.appointments;
CREATE POLICY "Clients delete own appointments"
ON public.appointments
FOR DELETE
TO authenticated
USING (auth.uid() = client_id AND auth.uid() = created_by);

-- Allow clients to update their own tasks (so they can tick complete from calendar)
DROP POLICY IF EXISTS "Clients update own tasks" ON public.tasks;
CREATE POLICY "Clients update own tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);
