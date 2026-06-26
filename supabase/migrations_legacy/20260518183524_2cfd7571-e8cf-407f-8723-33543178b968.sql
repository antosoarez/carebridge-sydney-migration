
-- Enums
CREATE TYPE public.client_tier AS ENUM ('tier_1','tier_2','tier_3');
CREATE TYPE public.client_report_status AS ENUM ('not_started','in_progress','completed','updating','finished');

-- Columns
ALTER TABLE public.profiles
  ADD COLUMN tier public.client_tier NOT NULL DEFAULT 'tier_1',
  ADD COLUMN report_status public.client_report_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN client_colour text NOT NULL DEFAULT 'ocean';

-- Trigger: block clients from changing advocate-managed fields
CREATE OR REPLACE FUNCTION public.guard_profile_advocate_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.report_status IS DISTINCT FROM OLD.report_status
       OR NEW.client_colour IS DISTINCT FROM OLD.client_colour THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, or client_colour';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_guard_advocate_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_advocate_fields();

-- Advocates can update any profile (needed to set fields on other users' rows)
CREATE POLICY "Advocates can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- SECURITY DEFINER: cascade-delete a client's related rows (does NOT touch auth.users).
-- Storage object cleanup + auth.users deletion happen in the edge function.
CREATE OR REPLACE FUNCTION public.admin_delete_client(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT public.has_role(_user_id, 'client') THEN
    RAISE EXCEPTION 'Target is not a client';
  END IF;

  DELETE FROM public.tasks            WHERE client_id = _user_id;
  DELETE FROM public.appointments     WHERE client_id = _user_id;
  DELETE FROM public.documents        WHERE client_id = _user_id OR uploaded_by = _user_id;
  DELETE FROM public.emotion_logs     WHERE user_id   = _user_id;
  DELETE FROM public.mfa_recovery_codes WHERE user_id = _user_id;
  DELETE FROM public.trusted_devices  WHERE user_id   = _user_id;
  DELETE FROM public.user_roles       WHERE user_id   = _user_id;
  DELETE FROM public.profiles         WHERE id        = _user_id;
END;
$$;
