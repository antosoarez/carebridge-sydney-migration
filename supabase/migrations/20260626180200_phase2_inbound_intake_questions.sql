-- =====================================================================
-- Phase 2 (Gap A): structured intake questions on enquiries
-- ---------------------------------------------------------------------
-- The public 4-question intake (and the marketing-site enquiry form) capture:
--   q1: what would you like help with?
--   q2: what's going on right now, in your own words?
--   q3: have you already taken any steps? (jsonb of checkboxes + notes)
--   q4: what matters most to you right now?
-- Stored alongside the free-text message on the inbound_messages row.
-- =====================================================================

ALTER TABLE public.inbound_messages
  ADD COLUMN IF NOT EXISTS intake_q1 text,
  ADD COLUMN IF NOT EXISTS intake_q2 text,
  ADD COLUMN IF NOT EXISTS intake_q3_steps jsonb,
  ADD COLUMN IF NOT EXISTS intake_q4 text;
