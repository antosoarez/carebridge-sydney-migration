-- =====================================================================
-- Phase -1: lifecycle enum reconciliation
-- ---------------------------------------------------------------------
-- The canonical Sydney project (dkfjmtysfuqtdpaqpxsd) was built by Lovable
-- and is missing the automation-engine lifecycle stages, plus the two new
-- stages approved for this rebuild. Add them idempotently. These labels are
-- only stored as text in automation configs and cast at runtime, so adding
-- them here (without using them) is safe inside a migration transaction.
-- =====================================================================

ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Booked';
ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Awaiting agreements';
ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Awaiting payment';
ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Work in progress';
ALTER TYPE public.client_lifecycle_status ADD VALUE IF NOT EXISTS 'Report delivered';
