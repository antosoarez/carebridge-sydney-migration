-- =====================================================================
-- Phase 3 (Stripe): service_tiers config
-- ---------------------------------------------------------------------
-- One row per purchasable tier, holding the price, Stripe Payment Link, and
-- report delivery window. slug maps to the existing client_tier enum
-- (tier_1/2/3). stripe_payment_link is filled in after the links are created
-- in Stripe (test mode). RLS: anyone may read active tiers; advocate manages.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.service_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  price_aud numeric(10,2) NOT NULL,
  stripe_payment_link text,
  delivery_days int NOT NULL DEFAULT 14,
  description text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.service_tiers TO authenticated, anon;
GRANT ALL ON public.service_tiers TO service_role;
ALTER TABLE public.service_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active tiers readable" ON public.service_tiers;
CREATE POLICY "active tiers readable" ON public.service_tiers
  FOR SELECT TO authenticated, anon USING (active = true);

DROP POLICY IF EXISTS "advocates manage tiers" ON public.service_tiers;
CREATE POLICY "advocates manage tiers" ON public.service_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- Seed the three tiers (Stripe Payment Links added once created in test mode).
INSERT INTO public.service_tiers (name, slug, price_aud, delivery_days, description, sort_order) VALUES
('Tier 1 — Summary',          'tier_1', 190.00, 14, 'An evidence-based summary of your situation with clear next steps.',        1),
('Tier 2 — Case Review',      'tier_2', 390.00, 21, 'An in-depth review with a structured report to share at your appointments.', 2),
('Tier 3 — Complex Support',  'tier_3', 690.00, 28, 'Comprehensive support for complex or multi-specialist cases.',               3)
ON CONFLICT (slug) DO NOTHING;
