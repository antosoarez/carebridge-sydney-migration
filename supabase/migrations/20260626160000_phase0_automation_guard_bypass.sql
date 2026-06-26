-- =====================================================================
-- Phase 0.1: let run_automations advance lifecycle for client-triggered events
-- ---------------------------------------------------------------------
-- guard_profile_advocate_fields() blocks lifecycle_status changes unless the
-- actor is an advocate OR the session GUC app.recomputing_progress='on'.
-- Client-triggered automations (e.g. agreements_completed when a client signs
-- the final agreement) run with the client's auth.uid(), so set_stage was
-- being blocked (caught + logged as 'error' in run_automations; lifecycle
-- never advanced).
--
-- Fix: bracket the set_stage UPDATE with the existing recompute bypass GUC
-- (transaction-local, restored to its prior value afterwards). The
-- security-critical guard function is left unchanged. run_automations only
-- updates lifecycle_status here, so the bypass scope is minimal.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.run_automations(
  _event_kind text,
  _client_id uuid,
  _event_key text,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  a record;
  v_advocate uuid;
  v_task_title text;
  v_new_stage public.client_lifecycle_status;
  v_match boolean;
  v_prev_bypass text;
BEGIN
  SELECT user_id INTO v_advocate FROM public.user_roles WHERE role = 'advocate' LIMIT 1;
  IF v_advocate IS NULL THEN v_advocate := _client_id; END IF;

  FOR r IN
    SELECT * FROM public.automation_rules
    WHERE enabled = true AND trigger_kind = _event_kind
    ORDER BY priority ASC
  LOOP
    v_match := true;
    IF r.trigger_config IS NOT NULL AND r.trigger_config <> '{}'::jsonb THEN
      v_match := (_payload @> r.trigger_config);
    END IF;
    IF NOT v_match THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.automation_runs
      WHERE rule_slug = r.slug
        AND client_id IS NOT DISTINCT FROM _client_id
        AND event_key IS NOT DISTINCT FROM _event_key
    ) THEN CONTINUE; END IF;

    FOR a IN
      SELECT * FROM public.automation_rule_actions
      WHERE rule_id = r.id ORDER BY sort_order ASC
    LOOP
      BEGIN
        IF a.action_kind = 'set_stage' THEN
          v_new_stage := (a.action_config->>'stage')::public.client_lifecycle_status;
          -- Bypass guard_profile_advocate_fields for this system-driven change.
          v_prev_bypass := current_setting('app.recomputing_progress', true);
          PERFORM set_config('app.recomputing_progress', 'on', true);
          UPDATE public.profiles SET lifecycle_status = v_new_stage WHERE id = _client_id;
          PERFORM set_config('app.recomputing_progress', COALESCE(v_prev_bypass, 'off'), true);

        ELSIF a.action_kind = 'create_task' THEN
          v_task_title := COALESCE(a.action_config->>'title', 'Follow up');
          INSERT INTO public.tasks(client_id, created_by, title, description, due_date, auto_dedup_key)
          VALUES (
            _client_id, v_advocate, v_task_title,
            a.action_config->>'description',
            CASE WHEN a.action_config ? 'due_in_days'
                 THEN (CURRENT_DATE + ((a.action_config->>'due_in_days')::int))::date
                 ELSE NULL END,
            'auto:' || r.slug || ':' || _client_id::text || ':' || COALESCE(_event_key,'')
          )
          ON CONFLICT DO NOTHING;

        ELSIF a.action_kind = 'unlock_payment_gate' THEN
          UPDATE public.profiles
             SET payment_gate_unlocked_at = COALESCE(payment_gate_unlocked_at, now())
           WHERE id = _client_id;

        ELSIF a.action_kind = 'grant_portal_access' THEN
          UPDATE public.profiles
             SET activated_at = COALESCE(activated_at, now())
           WHERE id = _client_id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Make sure a failed action never leaves the bypass GUC stuck on.
        PERFORM set_config('app.recomputing_progress', COALESCE(v_prev_bypass, 'off'), true);
        INSERT INTO public.automation_runs(rule_id, rule_slug, client_id, event_kind, event_key, status, detail)
        VALUES (r.id, r.slug, _client_id, _event_kind, _event_key, 'error',
                jsonb_build_object('action', a.action_kind, 'err', SQLERRM))
        ON CONFLICT DO NOTHING;
        CONTINUE;
      END;
    END LOOP;

    INSERT INTO public.automation_runs(rule_id, rule_slug, client_id, event_kind, event_key, status, detail)
    VALUES (r.id, r.slug, _client_id, _event_kind, _event_key, 'ok', _payload)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Re-assert the service_role lock (CREATE OR REPLACE keeps grants, but be explicit).
REVOKE ALL ON FUNCTION public.run_automations(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_automations(text, uuid, text, jsonb) TO service_role;
