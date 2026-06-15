-- =====================================================================
-- CareBridge automation engine: agreements, rules, events, lifecycle
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
CREATE POLICY "advocates read lifecycle events" ON public.client_lifecycle_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));
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

-- ---------- Agreement documents --------------------------------------
CREATE TABLE IF NOT EXISTS public.agreement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  body_md text NOT NULL,
  version int NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);
GRANT SELECT ON public.agreement_documents TO authenticated, anon;
GRANT ALL ON public.agreement_documents TO service_role;
ALTER TABLE public.agreement_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active agreements readable" ON public.agreement_documents
  FOR SELECT TO authenticated, anon USING (active = true);
CREATE POLICY "advocates manage agreements" ON public.agreement_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- ---------- Acceptances ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.agreement_documents(id) ON DELETE RESTRICT,
  document_slug text NOT NULL,
  document_version int NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_by_user_id uuid,
  method text NOT NULL DEFAULT 'checkbox_v1',
  ip text,
  user_agent text,
  notes text,
  UNIQUE (client_id, document_id)
);
GRANT SELECT, INSERT ON public.client_agreement_acceptances TO authenticated;
GRANT ALL ON public.client_agreement_acceptances TO service_role;
ALTER TABLE public.client_agreement_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients see own acceptances" ON public.client_agreement_acceptances
  FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "clients insert own acceptances" ON public.client_agreement_acceptances
  FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "advocates manage acceptances" ON public.client_agreement_acceptances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- Helper: are all required agreements accepted at their current version?
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
CREATE POLICY "advocates read rules" ON public.automation_rules
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));
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
GRANT SELECT ON public.automation_rule_actions TO authenticated;
GRANT ALL ON public.automation_rule_actions TO service_role;
ALTER TABLE public.automation_rule_actions ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "advocates read runs" ON public.automation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'advocate'));

-- ---------- Core dispatcher ------------------------------------------
-- Executes all enabled rules matching event_kind / trigger_config for a client.
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
  -- Pick any advocate as task owner (advocate-side system tasks)
  SELECT user_id INTO v_advocate FROM public.user_roles WHERE role = 'advocate' LIMIT 1;
  IF v_advocate IS NULL THEN v_advocate := _client_id; END IF;

  FOR r IN
    SELECT * FROM public.automation_rules
    WHERE enabled = true AND trigger_kind = _event_kind
    ORDER BY priority ASC
  LOOP
    -- Match trigger_config: every key in config must equal payload's key
    v_match := true;
    IF r.trigger_config IS NOT NULL AND r.trigger_config <> '{}'::jsonb THEN
      v_match := (_payload @> r.trigger_config);
    END IF;
    IF NOT v_match THEN CONTINUE; END IF;

    -- Idempotency: skip if already ran for this rule+client+event_key
    IF EXISTS (
      SELECT 1 FROM public.automation_runs
      WHERE rule_slug = r.slug
        AND client_id IS NOT DISTINCT FROM _client_id
        AND event_key IS NOT DISTINCT FROM _event_key
    ) THEN CONTINUE; END IF;

    -- Execute each action
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

-- 1) Enquiry created (inbound_messages with converted_client_id set OR new profile in 'New enquiry')
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

-- 2) Appointments: booked / completed
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
  ELSIF TG_OP = 'UPDATE' AND NEW.outcome = 'completed' AND COALESCE(OLD.outcome,'') <> 'completed' THEN
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

-- ---------- Seed agreement documents ---------------------------------
INSERT INTO public.agreement_documents(slug, title, body_md, version, required, sort_order) VALUES
('service_agreement', 'Service Agreement',
 E'CareBridge provides non-clinical health navigation and advocacy. We help you understand, organise and advocate for your care. We do not provide medical advice, diagnosis or treatment.\n\nFees, scope of work, and cancellation terms will be agreed separately. By accepting, you confirm you have read and understood the service terms.',
 1, true, 1),
('privacy_notice', 'Privacy Notice',
 E'We collect and store information you share so we can support you. Your information is kept in a secure database and only accessible to your advocate. We never share health details in notification emails. You can request a copy or deletion of your data at any time.',
 1, true, 2),
('scope_acknowledgment', 'Scope Acknowledgment',
 E'I understand that CareBridge provides non-clinical health navigation and advocacy, does not provide medical advice or treatment, and does not replace my doctor or treating team. In an emergency I will call 000.',
 1, true, 3),
('recording_consent', 'Recording Consent (optional)',
 E'Some appointments or calls may be recorded for accuracy and shared notes. Recording is optional and only happens with your explicit consent at the time.',
 1, false, 4)
ON CONFLICT (slug, version) DO NOTHING;

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

-- Seed actions for each rule
DO $$
DECLARE rid uuid;
BEGIN
  -- on_enquiry: set stage New enquiry + create offer task
  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_enquiry';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','New enquiry'), 1),
    (rid, 'create_task', jsonb_build_object('title','Offer Free discovery call','due_in_days',1), 2)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_discovery_booked';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Booked'), 1),
    (rid, 'create_task', jsonb_build_object('title','Prepare for discovery call','due_in_days',0), 2)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_discovery_complete';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Awaiting agreements'), 1),
    (rid, 'create_task', jsonb_build_object('title','Send agreements to sign','due_in_days',1), 2)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_agreements_done';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Awaiting payment'), 1),
    (rid, 'unlock_payment_gate', '{}'::jsonb, 2),
    (rid, 'create_task', jsonb_build_object('title','Send payment link for chosen service','due_in_days',1), 3)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_payment_received';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'set_stage', jsonb_build_object('stage','Active'), 1),
    (rid, 'grant_portal_access', '{}'::jsonb, 2),
    (rid, 'create_task', jsonb_build_object('title','Begin tier / first deliverable','due_in_days',2), 3)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_agreement_timeout';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Agreement follow-up','due_in_days',0), 1)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_payment_timeout';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Payment follow-up','due_in_days',0), 1)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_doc_uploaded';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Review document','due_in_days',2), 1)
  ON CONFLICT DO NOTHING;

  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_waiting_clinic';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'create_task', jsonb_build_object('title','Clinic follow-up','due_in_days',7), 1)
  ON CONFLICT DO NOTHING;
END $$;
