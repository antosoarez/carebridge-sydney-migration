select cron.schedule(
  'queue-appointment-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://umuvklhpppuchijbvsae.supabase.co/functions/v1/queue-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);