-- =====================================================================
-- Phase 1: schedule the automation-outbox dispatcher
-- ---------------------------------------------------------------------
-- Calls the dispatch-automation-outbox edge function every minute via pg_net,
-- authenticating with the shared token stored in Vault as 'outbox_dispatch_token'
-- (matches the function's OUTBOX_DISPATCH_TOKEN secret). The token value is NOT
-- in this migration — only a Vault lookup — so nothing secret is committed.
-- =====================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-automation-outbox');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dispatch-automation-outbox',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dkfjmtysfuqtdpaqpxsd.supabase.co/functions/v1/dispatch-automation-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'outbox_dispatch_token' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
