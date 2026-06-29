-- =====================================================================
-- Phase 2 (Gap E): "I've uploaded everything" → notify advocate
-- ---------------------------------------------------------------------
-- The client clicks "done uploading"; this RPC enqueues a client-safe
-- notification to the advocate via the Phase 1 outbox (email + in-app).
-- SECURITY DEFINER so the client can enqueue without write access to the
-- outbox. Deduped per client per day to avoid spam.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.client_uploads_done()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client uuid := auth.uid();
  v_advocate uuid;
BEGIN
  IF v_client IS NULL THEN RETURN; END IF;
  SELECT user_id INTO v_advocate FROM public.user_roles WHERE role = 'advocate' LIMIT 1;
  IF v_advocate IS NULL THEN RETURN; END IF;

  INSERT INTO public.automation_outbox(client_id, to_user_id, to_role, channels, template, dedup_key)
  VALUES (
    v_client, v_advocate, 'advocate', ARRAY['email','inapp'], 'advocate_uploads_done',
    'uploads_done:' || v_client::text || ':' || to_char(now(), 'YYYY-MM-DD')
  )
  ON CONFLICT (dedup_key) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.client_uploads_done() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_uploads_done() TO authenticated, service_role;
