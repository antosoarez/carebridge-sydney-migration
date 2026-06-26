-- =====================================================================
-- Phase -1: deploy the CareBridge automation engine to canonical (Sydney)
-- ---------------------------------------------------------------------
-- The engine never existed on dkfjmtysfuqtdpaqpxsd. This migration creates
-- ONLY the net-new objects. It deliberately does NOT (re)create
-- agreement_documents / client_agreement_acceptances or their policies —
-- those already exist live (with the 6 production agreement docs), so we
-- build on them. The legacy 4-doc seed is intentionally omitted.
--
-- Adaptations vs the original Lovable repo migration:
--   * appointment "completed" event fires on outcome = 'attended' (the real
--     CHECK value) instead of the impossible 'completed' (Stage-3 fix).
--   * all CREATE POLICY guarded with DROP POLICY IF EXISTS (idempotent).
--   * automation_rule_actions seeds are idempotent via a unique index.
--   * no agreement-document seed (live 6 docs are the source of truth).
-- All statements are idempotent so the file can be re-applied safely.
-- =====================================================================

-- ---------- Profile / fee additions ----------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_gate_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifecycle_status_changed_at timestamptz DEFAULT now();

ALTER TABLE public.client_fee_arrangements
  ADD COLUMN IF NOT EXISTS external_payment_link_url text;

-- Keep lifecycle_status_changed_at in sync
CREATE OR REPLACE FUNCTION public.touch_lifecycle_changed_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    NEW.lifecycle_status_changed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_lifecycle_changed ON public.profiles;
CREATE TRIGGER trg_profiles_lifecycle_changed
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_lifecycle_changed_at();

-- ---------- Lifecycle audit log --------------------------------------
CREATE TABLE IF NOT EXISTS public.client_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_status public.client_lifecycle_status,
  new_status public.client_lifecycle_status,
  reason text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.client_lifecycle_events TO authenticated;
GRANT ALL ON public.client_lifecycle_events TO service_role;
ALTER TABLE public.client_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advocates read lifecycle events" ON public.client_lifecycle_events;
CREATE POLICY "advocates read lifecycle events" ON public.client_lifecycle_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));
DROP POLICY IF EXISTS "clients read own lifecycle events" ON public.client_lifecycle_events;
CREATE POLICY "clients read own lifecycle events" ON public.client_lifecycle_events
  FOR SELECT TO authenticated USING (client_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_lifecycle_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    INSERT INTO public.client_lifecycle_events(client_id, old_status, new_status, actor_id)
    VALUES (NEW.id, OLD.lifecycle_status, NEW.lifecycle_status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_lifecycle_log ON public.profiles;
CREATE TRIGGER trg_profiles_lifecycle_log
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_lifecycle_change();

-- ---------- Helper: all required agreements accepted? ----------------
-- Builds on the EXISTING live agreement_documents / client_agreement_acceptances.
CREATE OR REPLACE FUNCTION public.client_has_all_required_agreements(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.agreement_documents d
    WHERE d.active = true AND d.required = true
      AND NOT EXISTS (
        SELECT 1 FROM public.client_agreement_acceptances a
        WHERE a.client_id = _client_id
          AND a.document_id = d.id
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.client_has_all_required_agreements(uuid) TO authenticated, service_role;

-- ---------- Automation rules / actions / runs ------------------------
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  trigger_kind text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.automation_rules TO authenticated;
GRANT ALL ON public.automation_rules TO service_role;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advocates read rules" ON public.automation_rules;
CREATE POLICY "advocates read rules" ON public.automation_rules
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));
DROP POLICY IF EXISTS "advocates toggle rules" ON public.automation_rules;
CREATE POLICY "advocates toggle rules" ON public.automation_rules
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE TABLE IF NOT EXISTS public.automation_rule_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  action_kind text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0
);
-- Idempotent seeding support (legacy had no constraint -> duplicate rows on re-run).
CREATE UNIQUE INDEX IF NOT EXISTS automation_rule_actions_rule_sort_uniq
  ON public.automation_rule_actions(rule_id, sort_order);
GRANT SELECT ON public.automation_rule_actions TO authenticated;
GRANT ALL ON public.automation_rule_actions TO service_role;
ALTER TABLE public.automation_rule_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advocates read actions" ON public.automation_rule_actions;
CREATE POLICY "advocates read actions" ON public.automation_rule_actions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  rule_slug text NOT NULL,
  client_id uuid,
  event_kind text NOT NULL,
  event_key text,
  status text NOT NULL DEFAULT 'ok',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_slug, client_id, event_key)
);
GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advocates read runs" ON public.automation_runs;
CREATE POLICY "advocates read runs" ON public.automation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));

-- ---------- Core dispatcher ------------------------------------------
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
          UPDATE public.profiles SET lifecycle_status = v_new_stage WHERE id = _client_id;

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

-- ---------- Event-source triggers ------------------------------------

-- 1) Enquiry created (profile enters 'New enquiry')
CREATE OR REPLACE FUNCTION public.trg_enquiry_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lifecycle_status = 'New enquiry' AND (TG_OP = 'INSERT' OR OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status) THEN
    PERFORM public.run_automations('enquiry_created', NEW.id, NEW.id::text || ':enquiry', '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_enquiry_created ON public.profiles;
CREATE TRIGGER trg_profiles_enquiry_created
AFTER INSERT OR UPDATE OF lifecycle_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_enquiry_created();

-- 2) Appointments: booked / completed (FIX: completion fires on 'attended')
CREATE OR REPLACE FUNCTION public.trg_appointment_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cat text := COALESCE(NEW.category, '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.run_automations(
      'appointment_booked', NEW.client_id, NEW.id::text || ':booked',
      jsonb_build_object('category', cat)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.outcome = 'attended' AND COALESCE(OLD.outcome,'') <> 'attended' THEN
    PERFORM public.run_automations(
      'appointment_completed', NEW.client_id, NEW.id::text || ':completed',
      jsonb_build_object('category', cat)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appts_event ON public.appointments;
CREATE TRIGGER trg_appts_event
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_event();

-- 3) Agreement acceptance -> maybe fire agreements_completed
CREATE OR REPLACE FUNCTION public.trg_agreement_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.client_has_all_required_agreements(NEW.client_id) THEN
    PERFORM public.run_automations(
      'agreements_completed', NEW.client_id,
      NEW.client_id::text || ':agreements_done', '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agreement_accepted ON public.client_agreement_acceptances;
CREATE TRIGGER trg_agreement_accepted
AFTER INSERT ON public.client_agreement_acceptances
FOR EACH ROW EXECUTE FUNCTION public.trg_agreement_accepted();

-- 4) Payment received
CREATE OR REPLACE FUNCTION public.trg_payment_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.paid = true AND COALESCE(OLD.paid, false) = false THEN
    PERFORM public.run_automations(
      'payment_received', NEW.client_id, NEW.id::text || ':paid', '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_received ON public.client_payments;
CREATE TRIGGER trg_payment_received
AFTER UPDATE ON public.client_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_payment_received();

-- 5) Document uploaded
CREATE OR REPLACE FUNCTION public.trg_document_uploaded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    PERFORM public.run_automations(
      'document_uploaded', NEW.client_id, NEW.id::text || ':doc', '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_document_uploaded ON public.documents;
CREATE TRIGGER trg_document_uploaded
AFTER INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.trg_document_uploaded();

-- 6) Stage changed -> waiting on clinic etc.
CREATE OR REPLACE FUNCTION public.trg_stage_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    PERFORM public.run_automations(
      'stage_changed', NEW.id,
      NEW.id::text || ':' || NEW.lifecycle_status::text,
      jsonb_build_object('stage', NEW.lifecycle_status::text)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_stage_changed ON public.profiles;
CREATE TRIGGER trg_profiles_stage_changed
AFTER UPDATE OF lifecycle_status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_stage_changed();

-- ---------- Time-based scan: stage timeouts --------------------------
CREATE OR REPLACE FUNCTION public.scan_stage_timeouts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT id, lifecycle_status, lifecycle_status_changed_at
      FROM public.profiles
     WHERE lifecycle_status IN ('Awaiting agreements','Awaiting payment')
       AND lifecycle_status_changed_at IS NOT NULL
       AND lifecycle_status_changed_at < now() - interval '3 days'
  LOOP
    PERFORM public.run_automations(
      'stage_timeout', p.id,
      p.id::text || ':' || p.lifecycle_status::text || ':' || to_char(p.lifecycle_status_changed_at,'YYYY-MM-DD'),
      jsonb_build_object('stage', p.lifecycle_status::text, 'after_days', 3)
    );
  END LOOP;
END $$;

-- ---------- Seed automation rules ------------------------------------
WITH rules(slug, name, trigger_kind, trigger_config, priority) AS (
  VALUES
    ('on_enquiry',           'New enquiry → offer discovery call', 'enquiry_created',     '{}'::jsonb, 10),
    ('on_discovery_booked',  'Discovery call booked',              'appointment_booked',  jsonb_build_object('category','free_discovery_call'), 20),
    ('on_discovery_complete','Discovery call complete',            'appointment_completed', jsonb_build_object('category','free_discovery_call'), 30),
    ('on_agreements_done',   'Agreements complete → ask payment',  'agreements_completed','{}'::jsonb, 40),
    ('on_payment_received',  'Payment received → activate',        'payment_received',    '{}'::jsonb, 50),
    ('on_agreement_timeout', 'Agreements stalled 3d',              'stage_timeout',       jsonb_build_object('stage','Awaiting agreements'), 60),
    ('on_payment_timeout',   'Payment stalled 3d',                 'stage_timeout',       jsonb_build_object('stage','Awaiting payment'), 70),
    ('on_doc_uploaded',      'Client uploaded a document',         'document_uploaded',   '{}'::jsonb, 80),
    ('on_waiting_clinic',    'Waiting on clinic follow-up',        'stage_changed',       jsonb_build_object('stage','Waiting on clinic'), 90)
)
INSERT INTO public.automation_rules(slug, name, trigger_kind, trigger_config, priority)
SELECT slug, name, trigger_kind, trigger_config, priority FROM rules
ON CONFLICT (slug) DO NOTHING;

-- Seed actions for each rule (idempotent via unique index on rule_id, sort_order)
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_enquiry';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','New enquiry'), 1),
    (rid, 'create_task', jsonb_build_object('title','Offer Free discovery call','due_in_days',1), 2)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_discovery_booked';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Booked'), 1),
    (rid, 'create_task', jsonb_build_object('title','Prepare for discovery call','due_in_days',0), 2)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_discovery_complete';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Awaiting agreements'), 1),
    (rid, 'create_task', jsonb_build_object('title','Send agreements to sign','due_in_days',1), 2)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_agreements_done';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Awaiting payment'), 1),
    (rid, 'unlock_payment_gate', '{}'::jsonb, 2),
    (rid, 'create_task', jsonb_build_object('title','Send payment link for chosen service','due_in_days',1), 3)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_payment_received';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Active'), 1),
    (rid, 'grant_portal_access', '{}'::jsonb, 2),
    (rid, 'create_task', jsonb_build_object('title','Begin tier / first deliverable','due_in_days',2), 3)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_agreement_timeout';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Agreement follow-up','due_in_days',0), 1)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_payment_timeout';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Payment follow-up','due_in_days',0), 1)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_doc_uploaded';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Review document','due_in_days',2), 1)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_waiting_clinic';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Clinic follow-up','due_in_days',7), 1)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;
END $$;
