-- =====================================================================
-- Phase 0.7: schedule scan_stage_timeouts()
-- ---------------------------------------------------------------------
-- scan_stage_timeouts() drives the on_agreement_timeout / on_payment_timeout
-- rules (clients stalled 3+ days in Awaiting agreements / Awaiting payment).
-- It is pure SQL (no HTTP), so schedule it directly via pg_cron — no edge
-- function or service-role key required. Hourly, offset to avoid colliding
-- with the existing top-of-hour jobs.
-- =====================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('scan-stage-timeouts-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'scan-stage-timeouts-hourly',
  '23 * * * *',
  $$SELECT public.scan_stage_timeouts();$$
);
