
-- =========================================================================
-- VAIL-A: Availability Request schema + security foundation
-- =========================================================================

-- 1. availability_requests --------------------------------------------------
CREATE TABLE public.availability_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  advocate_id uuid NOT NULL,
  appointment_category text NOT NULL CHECK (appointment_category IN (
    'GP','Specialist','Hospital','STI_clinic','Blood_test','Ultrasound',
    'Imaging','Pathology','Follow_up','Other'
  )),
  appointment_purpose text NOT NULL DEFAULT '',
  provider_name text,
  clinic_name text,
  location text,
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  urgency text NOT NULL DEFAULT 'flexible' CHECK (urgency IN ('flexible','soon','important')),
  preferred_appointment_length_minutes integer,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','sent_to_client','waiting_for_client','client_responded',
    'ready_to_book','clinic_contacted','appointment_confirmed','cancelled'
  )),
  interpreter_needed boolean NOT NULL DEFAULT false,
  telehealth_acceptable boolean NOT NULL DEFAULT true,
  in_person_required boolean NOT NULL DEFAULT false,
  transport_considerations text,
  advocate_notes text,
  client_facing_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  client_responded_at timestamptz
);
CREATE INDEX idx_avail_req_client ON public.availability_requests(client_id, status);
CREATE INDEX idx_avail_req_advocate ON public.availability_requests(advocate_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_requests TO authenticated;
GRANT ALL ON public.availability_requests TO service_role;

-- Column-level: hide advocate_notes from any direct SELECT by clients.
-- Authenticated keeps SELECT on every other column.
REVOKE SELECT ON public.availability_requests FROM authenticated;
GRANT SELECT (
  id, client_id, advocate_id, appointment_category, appointment_purpose,
  provider_name, clinic_name, location, date_range_start, date_range_end,
  urgency, preferred_appointment_length_minutes, status,
  interpreter_needed, telehealth_acceptable, in_person_required,
  transport_considerations, client_facing_notes,
  created_at, updated_at, sent_at, client_responded_at
) ON public.availability_requests TO authenticated;
-- advocate_notes is intentionally NOT granted to authenticated. Advocates
-- read it via the SECURITY DEFINER RPC get_advocate_notes() below.

ALTER TABLE public.availability_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates manage availability requests"
ON public.availability_requests
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate') AND advocate_id = auth.uid());

CREATE POLICY "Clients view own visible availability requests"
ON public.availability_requests
FOR SELECT TO authenticated
USING (
  client_id = auth.uid()
  AND status IN ('sent_to_client','waiting_for_client','client_responded',
                 'ready_to_book','clinic_contacted','appointment_confirmed')
);

CREATE POLICY "Clients submit response on own availability request"
ON public.availability_requests
FOR UPDATE TO authenticated
USING (
  client_id = auth.uid()
  AND status IN ('sent_to_client','waiting_for_client')
)
WITH CHECK (
  client_id = auth.uid()
  AND status IN ('waiting_for_client','client_responded')
  -- Lock all advocate-owned columns to their current values.
  AND advocate_id = (SELECT ar.advocate_id FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND appointment_category = (SELECT ar.appointment_category FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND appointment_purpose = (SELECT ar.appointment_purpose FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND COALESCE(provider_name,'') = COALESCE((SELECT ar.provider_name FROM public.availability_requests ar WHERE ar.id = availability_requests.id),'')
  AND COALESCE(clinic_name,'')   = COALESCE((SELECT ar.clinic_name   FROM public.availability_requests ar WHERE ar.id = availability_requests.id),'')
  AND COALESCE(location,'')      = COALESCE((SELECT ar.location      FROM public.availability_requests ar WHERE ar.id = availability_requests.id),'')
  AND date_range_start = (SELECT ar.date_range_start FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND date_range_end   = (SELECT ar.date_range_end   FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND urgency = (SELECT ar.urgency FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND preferred_appointment_length_minutes IS NOT DISTINCT FROM
      (SELECT ar.preferred_appointment_length_minutes FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND interpreter_needed    = (SELECT ar.interpreter_needed    FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND telehealth_acceptable = (SELECT ar.telehealth_acceptable FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND in_person_required    = (SELECT ar.in_person_required    FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND COALESCE(transport_considerations,'') = COALESCE((SELECT ar.transport_considerations FROM public.availability_requests ar WHERE ar.id = availability_requests.id),'')
  AND COALESCE(advocate_notes,'')     = COALESCE((SELECT ar.advocate_notes     FROM public.availability_requests ar WHERE ar.id = availability_requests.id),'')
  AND COALESCE(client_facing_notes,'')= COALESCE((SELECT ar.client_facing_notes FROM public.availability_requests ar WHERE ar.id = availability_requests.id),'')
  AND created_at = (SELECT ar.created_at FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
  AND sent_at IS NOT DISTINCT FROM (SELECT ar.sent_at FROM public.availability_requests ar WHERE ar.id = availability_requests.id)
);

-- 2. availability_options ---------------------------------------------------
CREATE TABLE public.availability_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_request_id uuid NOT NULL REFERENCES public.availability_requests(id) ON DELETE CASCADE,
  date date NOT NULL,
  time_window text NOT NULL CHECK (time_window IN ('morning','afternoon','evening','specific')),
  start_time time,
  end_time time,
  label text NOT NULL DEFAULT '',
  selected_by_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_avail_opt_req ON public.availability_options(availability_request_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_options TO authenticated;
GRANT ALL ON public.availability_options TO service_role;

ALTER TABLE public.availability_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates manage availability options"
ON public.availability_options
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Clients view own availability options"
ON public.availability_options
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.availability_requests ar
  WHERE ar.id = availability_request_id
    AND ar.client_id = auth.uid()
    AND ar.status IN ('sent_to_client','waiting_for_client','client_responded',
                      'ready_to_book','clinic_contacted','appointment_confirmed')
));

CREATE POLICY "Clients tick own availability options"
ON public.availability_options
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.availability_requests ar
  WHERE ar.id = availability_request_id
    AND ar.client_id = auth.uid()
    AND ar.status IN ('sent_to_client','waiting_for_client')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.availability_requests ar
  WHERE ar.id = availability_request_id
    AND ar.client_id = auth.uid()
    AND ar.status IN ('sent_to_client','waiting_for_client')
));

-- 3. client_availability_preferences ---------------------------------------
CREATE TABLE public.client_availability_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_request_id uuid NOT NULL UNIQUE REFERENCES public.availability_requests(id) ON DELETE CASCADE,
  prefers_morning boolean NOT NULL DEFAULT false,
  prefers_afternoon boolean NOT NULL DEFAULT false,
  prefers_after_work boolean NOT NULL DEFAULT false,
  prefers_telehealth boolean NOT NULL DEFAULT false,
  needs_transport boolean NOT NULL DEFAULT false,
  needs_interpreter boolean NOT NULL DEFAULT false,
  cannot_attend_this_week boolean NOT NULL DEFAULT false,
  needs_help_deciding boolean NOT NULL DEFAULT false,
  flexible boolean NOT NULL DEFAULT false,
  client_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_availability_preferences TO authenticated;
GRANT ALL ON public.client_availability_preferences TO service_role;

ALTER TABLE public.client_availability_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates manage client availability preferences"
ON public.client_availability_preferences
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Clients view own preferences"
ON public.client_availability_preferences
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.availability_requests ar
  WHERE ar.id = availability_request_id
    AND ar.client_id = auth.uid()
    AND ar.status IN ('sent_to_client','waiting_for_client','client_responded',
                      'ready_to_book','clinic_contacted','appointment_confirmed')
));

CREATE POLICY "Clients insert own preferences"
ON public.client_availability_preferences
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.availability_requests ar
  WHERE ar.id = availability_request_id
    AND ar.client_id = auth.uid()
    AND ar.status IN ('sent_to_client','waiting_for_client')
));

CREATE POLICY "Clients update own preferences"
ON public.client_availability_preferences
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.availability_requests ar
  WHERE ar.id = availability_request_id
    AND ar.client_id = auth.uid()
    AND ar.status IN ('sent_to_client','waiting_for_client')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.availability_requests ar
  WHERE ar.id = availability_request_id
    AND ar.client_id = auth.uid()
    AND ar.status IN ('sent_to_client','waiting_for_client')
));

-- 4. clinic_contact_logs ---------------------------------------------------
CREATE TABLE public.clinic_contact_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_request_id uuid NOT NULL REFERENCES public.availability_requests(id) ON DELETE CASCADE,
  advocate_id uuid NOT NULL,
  clinic_name text NOT NULL DEFAULT '',
  phone_number text,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  person_spoken_to text,
  accepts_advocate text NOT NULL DEFAULT 'unknown' CHECK (accepts_advocate IN ('yes','no','unknown')),
  requires_authority_form text NOT NULL DEFAULT 'unknown' CHECK (requires_authority_form IN ('yes','no','unknown')),
  outcome text NOT NULL DEFAULT 'not_contacted' CHECK (outcome IN (
    'not_contacted','called_no_answer','waiting_for_callback',
    'clinic_accepted_advocacy','clinic_requires_consent_form',
    'appointment_offered','appointment_booked'
  )),
  notes text,
  next_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clinic_logs_req ON public.clinic_contact_logs(availability_request_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_contact_logs TO authenticated;
GRANT ALL ON public.clinic_contact_logs TO service_role;

ALTER TABLE public.clinic_contact_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates manage clinic contact logs"
ON public.clinic_contact_logs
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate') AND advocate_id = auth.uid());
-- Clients: no policy = no access.

-- 5. Extend appointments ---------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS availability_request_id uuid REFERENCES public.availability_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS practitioner_name text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS client_visible_notes text,
  ADD COLUMN IF NOT EXISTS advocate_private_notes text,
  ADD COLUMN IF NOT EXISTS preparation_instructions text,
  ADD COLUMN IF NOT EXISTS what_to_bring text;

CREATE INDEX IF NOT EXISTS idx_appointments_avail_req ON public.appointments(availability_request_id);

-- 6. Triggers --------------------------------------------------------------

-- Touch + sender-id + auto-stamps for availability_requests
CREATE OR REPLACE FUNCTION public.availability_requests_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.has_role(auth.uid(), 'advocate') THEN
      NEW.advocate_id := auth.uid();
    END IF;
  END IF;
  NEW.updated_at := now();
  IF NEW.status = 'sent_to_client' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  IF NEW.status = 'client_responded' AND NEW.client_responded_at IS NULL THEN
    NEW.client_responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_availability_requests_touch
BEFORE INSERT OR UPDATE ON public.availability_requests
FOR EACH ROW EXECUTE FUNCTION public.availability_requests_touch();

-- Status transition guard
CREATE OR REPLACE FUNCTION public.availability_requests_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_advocate boolean := public.has_role(auth.uid(), 'advocate');
  is_client boolean := (auth.uid() IS NOT NULL AND auth.uid() = NEW.client_id);
  ok boolean := false;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND is_advocate THEN
    ok := true;
  ELSIF OLD.status = 'draft' AND NEW.status = 'sent_to_client' AND is_advocate THEN
    ok := true;
  ELSIF OLD.status = 'sent_to_client' AND NEW.status = 'waiting_for_client' AND (is_advocate OR is_client) THEN
    ok := true;
  ELSIF OLD.status = 'waiting_for_client' AND NEW.status = 'client_responded' AND is_client THEN
    ok := true;
  ELSIF OLD.status = 'client_responded' AND NEW.status = 'ready_to_book' AND is_advocate THEN
    ok := true;
  ELSIF OLD.status = 'ready_to_book' AND NEW.status = 'clinic_contacted' AND is_advocate THEN
    IF EXISTS (SELECT 1 FROM public.clinic_contact_logs WHERE availability_request_id = NEW.id) THEN
      ok := true;
    ELSE
      RAISE EXCEPTION 'Cannot move to clinic_contacted without at least one clinic_contact_logs entry';
    END IF;
  ELSIF OLD.status = 'clinic_contacted' AND NEW.status = 'appointment_confirmed' AND is_advocate THEN
    IF EXISTS (SELECT 1 FROM public.appointments WHERE availability_request_id = NEW.id) THEN
      ok := true;
    ELSE
      RAISE EXCEPTION 'Cannot move to appointment_confirmed without a linked appointment';
    END IF;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'Invalid availability_request status transition: % -> %', OLD.status, NEW.status
      USING HINT = 'Check role permissions and the documented transition table.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_availability_requests_status_guard
BEFORE UPDATE OF status ON public.availability_requests
FOR EACH ROW EXECUTE FUNCTION public.availability_requests_status_guard();

-- Sender-id stamp + touch for clinic_contact_logs
CREATE OR REPLACE FUNCTION public.clinic_contact_logs_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.advocate_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clinic_contact_logs_stamp
BEFORE INSERT ON public.clinic_contact_logs
FOR EACH ROW EXECUTE FUNCTION public.clinic_contact_logs_stamp();

-- Touch trigger for client_availability_preferences
CREATE OR REPLACE FUNCTION public.client_availability_preferences_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_client_availability_preferences_touch
BEFORE UPDATE ON public.client_availability_preferences
FOR EACH ROW EXECUTE FUNCTION public.client_availability_preferences_touch();

-- 7. SECURITY DEFINER RPC for advocate_notes access ------------------------
CREATE OR REPLACE FUNCTION public.get_advocate_notes(_request_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notes text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT advocate_notes INTO notes
    FROM public.availability_requests
   WHERE id = _request_id;
  RETURN notes;
END;
$$;

REVOKE ALL ON FUNCTION public.get_advocate_notes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_advocate_notes(uuid) TO authenticated;
