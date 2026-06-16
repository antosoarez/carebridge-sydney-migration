Two-part fix. Part 2 (privacy link) is already done in `src/pages/ClientOnboarding.tsx` — it now points to `https://carebridgeperth.com/privacy.html` with `target="_blank" rel="noopener noreferrer"`. Approving this plan creates the migration file that fixes Part 1 (the `client_consents` schema-cache error and the other six missing tables).

## What gets created on approve

A single new migration file: `supabase/migrations/20260616000000_repair_missing_tables.sql`, fully idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before each `CREATE POLICY`). It restores seven tables plus the `templates` storage bucket and the columns onboarding writes into `profiles`. No `run_automations` references, no agreement-acceptance trigger, no `ALTER TYPE client_lifecycle_status`.

## Final SQL

```sql
-- supabase/migrations/20260616000000_repair_missing_tables.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS preferred_language text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS navigation_intake_seen_at timestamptz;

-- client_consents (append-only)
CREATE TABLE IF NOT EXISTS public.client_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('scope_acknowledgment','privacy_consent')),
  language text NOT NULL DEFAULT 'en',
  consent_text text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.client_consents TO authenticated;
GRANT ALL ON public.client_consents TO service_role;
CREATE INDEX IF NOT EXISTS idx_client_consents_user ON public.client_consents(user_id, kind);
ALTER TABLE public.client_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert their own consents" ON public.client_consents;
DROP POLICY IF EXISTS "Users can view their own consents" ON public.client_consents;
DROP POLICY IF EXISTS "Advocates can view client consents" ON public.client_consents;
CREATE POLICY "Users can insert their own consents" ON public.client_consents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view their own consents" ON public.client_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Advocates can view client consents" ON public.client_consents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'advocate'));

-- client_navigation_intake
CREATE TABLE IF NOT EXISTS public.client_navigation_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.client_cases(id) ON DELETE SET NULL,
  language text NOT NULL DEFAULT 'en',
  help_with text, whats_going_on text,
  step_contacted_gp boolean NOT NULL DEFAULT false,
  step_got_referral boolean NOT NULL DEFAULT false,
  step_appointment_booked boolean NOT NULL DEFAULT false,
  steps_notes text, matters_most text,
  source text NOT NULL DEFAULT 'onboarding',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.client_navigation_intake TO authenticated;
GRANT ALL ON public.client_navigation_intake TO service_role;
CREATE INDEX IF NOT EXISTS idx_cni_client ON public.client_navigation_intake(client_id);
CREATE INDEX IF NOT EXISTS idx_cni_case ON public.client_navigation_intake(case_id);
ALTER TABLE public.client_navigation_intake ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Client can view own intake" ON public.client_navigation_intake;
DROP POLICY IF EXISTS "Client can insert own intake" ON public.client_navigation_intake;
DROP POLICY IF EXISTS "Client can update own intake" ON public.client_navigation_intake;
DROP POLICY IF EXISTS "Advocates can view intake" ON public.client_navigation_intake;
DROP POLICY IF EXISTS "Advocates can update intake" ON public.client_navigation_intake;
CREATE POLICY "Client can view own intake" ON public.client_navigation_intake
  FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "Client can insert own intake" ON public.client_navigation_intake
  FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "Client can update own intake" ON public.client_navigation_intake
  FOR UPDATE TO authenticated USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
CREATE POLICY "Advocates can view intake" ON public.client_navigation_intake
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'advocate'));
CREATE POLICY "Advocates can update intake" ON public.client_navigation_intake
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'advocate'))
  WITH CHECK (public.has_role(auth.uid(),'advocate'));

CREATE OR REPLACE FUNCTION public.touch_client_navigation_intake()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_client_navigation_intake ON public.client_navigation_intake;
CREATE TRIGGER trg_touch_client_navigation_intake
  BEFORE UPDATE ON public.client_navigation_intake
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_navigation_intake();

-- agreement_documents
CREATE TABLE IF NOT EXISTS public.agreement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL, title text NOT NULL, body_md text NOT NULL,
  version int NOT NULL DEFAULT 1, required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true, sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);
GRANT SELECT ON public.agreement_documents TO authenticated, anon;
GRANT ALL ON public.agreement_documents TO service_role;
ALTER TABLE public.agreement_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active agreements readable" ON public.agreement_documents;
DROP POLICY IF EXISTS "advocates manage agreements" ON public.agreement_documents;
CREATE POLICY "active agreements readable" ON public.agreement_documents
  FOR SELECT TO authenticated, anon USING (active = true);
CREATE POLICY "advocates manage agreements" ON public.agreement_documents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'advocate'))
  WITH CHECK (public.has_role(auth.uid(),'advocate'));

-- client_agreement_acceptances (append-only)
CREATE TABLE IF NOT EXISTS public.client_agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.agreement_documents(id) ON DELETE RESTRICT,
  document_slug text NOT NULL, document_version int NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  accepted_by_user_id uuid,
  method text NOT NULL DEFAULT 'checkbox_v1',
  ip text, user_agent text, notes text,
  UNIQUE (client_id, document_id)
);
GRANT SELECT, INSERT ON public.client_agreement_acceptances TO authenticated;
GRANT ALL ON public.client_agreement_acceptances TO service_role;
ALTER TABLE public.client_agreement_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients see own acceptances" ON public.client_agreement_acceptances;
DROP POLICY IF EXISTS "clients insert own acceptances" ON public.client_agreement_acceptances;
DROP POLICY IF EXISTS "advocates see acceptances" ON public.client_agreement_acceptances;
DROP POLICY IF EXISTS "advocates insert acceptances" ON public.client_agreement_acceptances;
CREATE POLICY "clients see own acceptances" ON public.client_agreement_acceptances
  FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "clients insert own acceptances" ON public.client_agreement_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND accepted_by_user_id = auth.uid());
CREATE POLICY "advocates see acceptances" ON public.client_agreement_acceptances
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'advocate'));
CREATE POLICY "advocates insert acceptances" ON public.client_agreement_acceptances
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'advocate'));

CREATE OR REPLACE FUNCTION public.client_has_all_required_agreements(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.agreement_documents d
    WHERE d.active AND d.required
      AND NOT EXISTS (
        SELECT 1 FROM public.client_agreement_acceptances a
        WHERE a.client_id = _client_id AND a.document_id = d.id
      )
  );
$$;
REVOKE ALL ON FUNCTION public.client_has_all_required_agreements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_has_all_required_agreements(uuid) TO authenticated, service_role;

-- automation_rules + automation_rule_actions (config only, no engine triggers)
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, name text NOT NULL, description text,
  trigger_kind text NOT NULL, trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true, priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.automation_rules TO authenticated;
GRANT ALL ON public.automation_rules TO service_role;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advocates read rules" ON public.automation_rules;
DROP POLICY IF EXISTS "advocates toggle rules" ON public.automation_rules;
CREATE POLICY "advocates read rules" ON public.automation_rules
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'advocate'));
CREATE POLICY "advocates toggle rules" ON public.automation_rules
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'advocate'))
  WITH CHECK (public.has_role(auth.uid(),'advocate'));

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
DROP POLICY IF EXISTS "advocates read actions" ON public.automation_rule_actions;
CREATE POLICY "advocates read actions" ON public.automation_rule_actions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'advocate'));

-- document_templates + templates bucket
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type
    WHERE typname='template_audience' AND typnamespace='public'::regnamespace) THEN
    CREATE TYPE public.template_audience AS ENUM ('patient','clinic','both');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL, description text,
  audience public.template_audience NOT NULL DEFAULT 'patient',
  storage_path text, file_name text, mime_type text, size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Advocates view templates" ON public.document_templates;
DROP POLICY IF EXISTS "Advocates insert templates" ON public.document_templates;
DROP POLICY IF EXISTS "Advocates update templates" ON public.document_templates;
DROP POLICY IF EXISTS "Advocates delete templates" ON public.document_templates;
CREATE POLICY "Advocates view templates" ON public.document_templates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'advocate'));
CREATE POLICY "Advocates insert templates" ON public.document_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'advocate') AND auth.uid() = created_by);
CREATE POLICY "Advocates update templates" ON public.document_templates
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'advocate'))
  WITH CHECK (public.has_role(auth.uid(),'advocate'));
CREATE POLICY "Advocates delete templates" ON public.document_templates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'advocate'));

INSERT INTO storage.buckets (id, name, public) VALUES ('templates','templates',false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Advocates read templates bucket" ON storage.objects;
DROP POLICY IF EXISTS "Advocates upload to templates bucket" ON storage.objects;
DROP POLICY IF EXISTS "Advocates delete from templates bucket" ON storage.objects;
CREATE POLICY "Advocates read templates bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='templates' AND public.has_role(auth.uid(),'advocate'));
CREATE POLICY "Advocates upload to templates bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='templates' AND public.has_role(auth.uid(),'advocate'));
CREATE POLICY "Advocates delete from templates bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id='templates' AND public.has_role(auth.uid(),'advocate'));

-- Seed agreements + automation rule config (idempotent)
INSERT INTO public.agreement_documents(slug,title,body_md,version,required,sort_order) VALUES
('service_agreement','Service Agreement',
 E'CareBridge provides non-clinical health navigation and advocacy...',1,true,1),
('privacy_notice','Privacy Notice',
 E'We collect and store information you share so we can support you...',1,true,2),
('scope_acknowledgment','Scope Acknowledgment',
 E'I understand that CareBridge provides non-clinical health navigation...',1,true,3),
('recording_consent','Recording Consent (optional)',
 E'Some appointments or calls may be recorded for accuracy...',1,false,4)
ON CONFLICT (slug, version) DO NOTHING;

WITH rules(slug,name,trigger_kind,trigger_config,priority) AS (VALUES
  ('on_enquiry','New enquiry → offer discovery call','enquiry_created','{}'::jsonb,10),
  ('on_discovery_booked','Discovery call booked','appointment_booked',
   jsonb_build_object('category','free_discovery_call'),20),
  ('on_discovery_complete','Discovery call complete','appointment_completed',
   jsonb_build_object('category','free_discovery_call'),30),
  ('on_agreements_done','Agreements complete → ask payment','agreements_completed','{}'::jsonb,40),
  ('on_payment_received','Payment received → activate','payment_received','{}'::jsonb,50),
  ('on_agreement_timeout','Agreements stalled 3d','stage_timeout',
   jsonb_build_object('stage','Awaiting agreements'),60),
  ('on_payment_timeout','Payment stalled 3d','stage_timeout',
   jsonb_build_object('stage','Awaiting payment'),70),
  ('on_doc_uploaded','Client uploaded a document','document_uploaded','{}'::jsonb,80),
  ('on_waiting_clinic','Waiting on clinic follow-up','stage_changed',
   jsonb_build_object('stage','Waiting on clinic'),90))
INSERT INTO public.automation_rules(slug,name,trigger_kind,trigger_config,priority)
SELECT * FROM rules ON CONFLICT (slug) DO NOTHING;
```

## Why this fixes the bug

The onboarding step-6 "Finish" calls `supabase.from("client_consents").insert(...)`. That table doesn't exist in your live database, which is exactly the `Could not find the table 'public.client_consents' in the schema cache` error. Once this migration runs, the insert succeeds and the user is routed to `/client/navigation-intake`. The privacy link is already fixed in code.

## Important note about applying

Once you approve and I switch to build mode, I will write the migration file. The Lovable Cloud connector must be enabled for the migration to actually run against Supabase — if it isn't, the file will exist in the repo but won't be applied until you enable it under Connectors → Lovable Cloud.