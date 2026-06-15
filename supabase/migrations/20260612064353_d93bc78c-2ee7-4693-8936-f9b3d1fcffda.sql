
-- 1. Enquiry pipeline enum
CREATE TYPE public.enquiry_pipeline_status AS ENUM
  ('new','contacted','qualified','converted','not_a_fit','archived');

-- 2. New columns on inbound_messages
ALTER TABLE public.inbound_messages
  ADD COLUMN enquiry_status public.enquiry_pipeline_status NOT NULL DEFAULT 'new',
  ADD COLUMN source text,
  ADD COLUMN internal_notes text,
  ADD COLUMN assigned_advocate uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN converted_client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN converted_at timestamptz,
  ADD COLUMN last_contacted_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill from legacy status
UPDATE public.inbound_messages
  SET enquiry_status = CASE status
    WHEN 'new' THEN 'new'::public.enquiry_pipeline_status
    WHEN 'read' THEN 'contacted'::public.enquiry_pipeline_status
    WHEN 'archived' THEN 'archived'::public.enquiry_pipeline_status
    ELSE 'new'::public.enquiry_pipeline_status
  END;

CREATE INDEX IF NOT EXISTS inbound_messages_enquiry_status_idx
  ON public.inbound_messages (enquiry_status);

-- Touch trigger for updated_at
CREATE OR REPLACE FUNCTION public.touch_inbound_messages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_inbound_messages_updated_at ON public.inbound_messages;
CREATE TRIGGER trg_touch_inbound_messages_updated_at
  BEFORE UPDATE ON public.inbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_inbound_messages_updated_at();

-- 3. Client lifecycle enum
CREATE TYPE public.client_lifecycle_status AS ENUM (
  'New enquiry',
  'Invited',
  'Invite accepted',
  'Onboarding incomplete',
  'Onboarding complete',
  'Active',
  'Waiting on client',
  'Waiting on clinic',
  'Appointment upcoming',
  'Report in progress',
  'Payment outstanding',
  'Follow-up required',
  'Completed',
  'Ongoing support',
  'Inactive'
);

ALTER TABLE public.profiles
  ADD COLUMN lifecycle_status public.client_lifecycle_status DEFAULT 'New enquiry';

-- Backfill lifecycle_status for existing clients
UPDATE public.profiles p
  SET lifecycle_status = CASE
    WHEN p.activated_at IS NOT NULL THEN 'Active'::public.client_lifecycle_status
    WHEN p.activated_at IS NULL AND p.must_change_password = true THEN 'Invited'::public.client_lifecycle_status
    ELSE 'New enquiry'::public.client_lifecycle_status
  END
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'client'
  );

-- 4. Extend guard to block client-side writes of lifecycle_status
CREATE OR REPLACE FUNCTION public.guard_profile_advocate_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.recomputing_progress', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.report_status IS DISTINCT FROM OLD.report_status
       OR NEW.client_colour IS DISTINCT FROM OLD.client_colour
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.client_progress IS DISTINCT FROM OLD.client_progress
       OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, client_colour, payment_status, client_progress, or lifecycle_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
