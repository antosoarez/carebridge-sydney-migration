-- =====================================================================
-- Phase 2 (Gap D): client_intake table  (bug fix)
-- ---------------------------------------------------------------------
-- The frontend (src/lib/client-intake-store.ts + ClientIntakeForm.tsx) already
-- reads/writes public.client_intake, but the table was never created on the
-- canonical DB (it only existed in docs/repair-and-link.sql.md). Create it to
-- match the ClientIntakeRecord shape, with draft autosave (upsert on client_id)
-- and a submit gate (submitted_at). RLS: client manages own row; advocate reads.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.client_intake (
  client_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Section 1 — Personal Details
  full_name text,
  preferred_name text,
  date_of_birth date,
  gender text,
  pronouns text,
  mobile_phone text,
  email text,
  residential_address text,
  suburb text,
  postcode text,
  state text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,

  -- Section 2 — Treating doctors
  gp_name text,
  gp_clinic text,
  gp_phone text,
  gp_email text,
  specialists text,

  -- Section 3 — Reason for engaging
  services_interested text[] NOT NULL DEFAULT '{}',
  help_needed text,
  main_outcome text,

  -- Section 4 — Current health concerns
  main_concerns text,
  concerns_onset text,

  -- Section 5 — Medical history
  diagnosed_conditions text,
  current_medications text,
  allergies text,
  recent_investigations text,

  -- Section 6 — Administrative
  referral_source text,
  preferred_contact_method text,
  other_info text,

  -- Meta
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_intake TO authenticated;
GRANT ALL ON public.client_intake TO service_role;

ALTER TABLE public.client_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client manages own intake" ON public.client_intake;
CREATE POLICY "Client manages own intake"
  ON public.client_intake FOR ALL TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

DROP POLICY IF EXISTS "Advocates can view all intakes" ON public.client_intake;
CREATE POLICY "Advocates can view all intakes"
  ON public.client_intake FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));
