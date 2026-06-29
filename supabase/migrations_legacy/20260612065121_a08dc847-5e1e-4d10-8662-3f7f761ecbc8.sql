
-- =========================================================================
-- 1. Reset enquiry_status + source on inbound_messages
-- =========================================================================
-- Drop existing enum-backed column (only added in prior turn, no UI reads it)
ALTER TABLE public.inbound_messages DROP COLUMN IF EXISTS enquiry_status;
DROP TYPE IF EXISTS public.enquiry_pipeline_status;
ALTER TABLE public.inbound_messages DROP COLUMN IF EXISTS source;

-- Re-add as text + CHECK per Phase 1 spec
ALTER TABLE public.inbound_messages
  ADD COLUMN enquiry_status text NOT NULL DEFAULT 'New'
    CHECK (enquiry_status IN (
      'New','Reviewed','Replied',
      'Discovery call offered','Discovery call booked',
      'Invite sent','Converted to client',
      'Not suitable','No response','Archived'
    )),
  ADD COLUMN source text DEFAULT 'in_app_contact'
    CHECK (source IS NULL OR source IN (
      'website_form','manual','calendly','email','referral','in_app_contact'
    )),
  ADD COLUMN preferred_contact text,
  ADD COLUMN service_interest text;

-- Backfill enquiry_status from legacy `status` column
UPDATE public.inbound_messages
  SET enquiry_status = CASE status
    WHEN 'read'     THEN 'Reviewed'
    WHEN 'archived' THEN 'Archived'
    ELSE 'New'
  END;

CREATE INDEX IF NOT EXISTS inbound_messages_enquiry_status_idx
  ON public.inbound_messages (enquiry_status);

-- =========================================================================
-- 2. RLS for inbound_messages (advocate read/update/delete + service-role insert)
-- =========================================================================
-- Existing anon INSERT policy stays. Add advocate + service_role policies.
DROP POLICY IF EXISTS "Advocates can view inbound enquiries" ON public.inbound_messages;
CREATE POLICY "Advocates can view inbound enquiries"
  ON public.inbound_messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

DROP POLICY IF EXISTS "Advocates can update inbound enquiries" ON public.inbound_messages;
CREATE POLICY "Advocates can update inbound enquiries"
  ON public.inbound_messages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

DROP POLICY IF EXISTS "Advocates can delete inbound enquiries" ON public.inbound_messages;
CREATE POLICY "Advocates can delete inbound enquiries"
  ON public.inbound_messages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- Service-role bypasses RLS automatically, but grant ALL for clarity.
GRANT ALL ON public.inbound_messages TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.inbound_messages TO authenticated;

-- =========================================================================
-- 3. Auto-task on new enquiry (with dedup key)
-- =========================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS auto_dedup_key text;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_auto_dedup_key_unique
  ON public.tasks (auto_dedup_key)
  WHERE auto_dedup_key IS NOT NULL AND status <> 'complete';

CREATE OR REPLACE FUNCTION public.create_task_on_new_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  advocate_id uuid;
BEGIN
  IF NEW.enquiry_status <> 'New' THEN
    RETURN NEW;
  END IF;

  -- Pick the primary advocate (the single practitioner pattern used elsewhere)
  SELECT user_id INTO advocate_id
    FROM public.user_roles
    WHERE role = 'advocate'
    ORDER BY created_at ASC
    LIMIT 1;

  IF advocate_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- tasks.client_id is NOT NULL, so we file enquiry-reply tasks under the
  -- advocate's own profile id (no client exists yet for this enquiry).
  INSERT INTO public.tasks (
    client_id, created_by, title, description,
    status, due_date, is_priority, auto_dedup_key
  )
  VALUES (
    advocate_id, advocate_id,
    'Reply to new enquiry: ' || COALESCE(NEW.name, 'Unknown'),
    COALESCE('From: ' || NEW.email, '') ||
      CASE WHEN NEW.phone IS NOT NULL THEN E'\nPhone: ' || NEW.phone ELSE '' END ||
      CASE WHEN NEW.message IS NOT NULL THEN E'\n\n' || NEW.message ELSE '' END,
    'to_do',
    (now() + interval '24 hours')::date,
    true,
    'enquiry_reply:' || NEW.id::text
  )
  ON CONFLICT (auto_dedup_key) WHERE auto_dedup_key IS NOT NULL AND status <> 'complete'
  DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbound_messages_create_task ON public.inbound_messages;
CREATE TRIGGER trg_inbound_messages_create_task
  AFTER INSERT ON public.inbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.create_task_on_new_enquiry();
