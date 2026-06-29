-- =====================================================================
-- Phase 4 (Gap G/J/K): booking + scheduling schema
-- ---------------------------------------------------------------------
-- - advocate_availability: weekly recurring slots the client can book against.
-- - appointments.video_link: Zoom/Meet URL (semantically distinct from location).
-- - automation_outbox.not_before: lets us enqueue delayed/scheduled sends
--   (reminders, follow-up nudge) that the dispatcher only delivers once due.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.advocate_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advocate_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun .. 6=Sat
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.advocate_availability TO authenticated, anon;
GRANT ALL ON public.advocate_availability TO service_role;
ALTER TABLE public.advocate_availability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active availability readable" ON public.advocate_availability;
CREATE POLICY "active availability readable" ON public.advocate_availability
  FOR SELECT TO authenticated, anon USING (active = true);
DROP POLICY IF EXISTS "advocate manages availability" ON public.advocate_availability;
CREATE POLICY "advocate manages availability" ON public.advocate_availability
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- Seed Mon–Fri 09:00–17:00 for the primary advocate (AWST is the app's tz).
DO $$
DECLARE adv uuid;
BEGIN
  SELECT user_id INTO adv FROM public.user_roles WHERE role = 'advocate' ORDER BY created_at LIMIT 1;
  IF adv IS NOT NULL THEN
    INSERT INTO public.advocate_availability (advocate_id, day_of_week, start_time, end_time)
    SELECT adv, d, '09:00'::time, '17:00'::time
    FROM generate_series(1, 5) AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.advocate_availability a WHERE a.advocate_id = adv AND a.day_of_week = d
    );
  END IF;
END $$;

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS video_link text;

ALTER TABLE public.automation_outbox ADD COLUMN IF NOT EXISTS not_before timestamptz NOT NULL DEFAULT now();
