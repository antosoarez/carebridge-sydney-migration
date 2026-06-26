-- =====================================================================
-- Phase 3 (Stripe): Stripe columns on client_payments
-- ---------------------------------------------------------------------
-- The stripe-webhook records the Checkout session / payment intent and flips
-- paid -> true, which fires the existing trg_payment_received automation
-- (lifecycle -> Active, portal access, begin-work task, client/advocate
-- notifications). Unique index on stripe_session_id makes ingestion idempotent.
-- =====================================================================

ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'AUD';

CREATE UNIQUE INDEX IF NOT EXISTS client_payments_stripe_session_uniq
  ON public.client_payments(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
