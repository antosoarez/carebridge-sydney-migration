
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS report_requested_from date NULL,
  ADD COLUMN IF NOT EXISTS report_requested_to date NULL,
  ADD COLUMN IF NOT EXISTS client_progress smallint NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_client_progress_range;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_client_progress_range CHECK (client_progress >= 0 AND client_progress <= 100);

CREATE OR REPLACE FUNCTION public.guard_profile_advocate_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.report_status IS DISTINCT FROM OLD.report_status
       OR NEW.client_colour IS DISTINCT FROM OLD.client_colour
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.report_progress IS DISTINCT FROM OLD.report_progress
       OR NEW.report_requested_from IS DISTINCT FROM OLD.report_requested_from
       OR NEW.report_requested_to IS DISTINCT FROM OLD.report_requested_to
       OR NEW.client_progress IS DISTINCT FROM OLD.client_progress THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, client_colour, payment_status, report_progress, report_requested_from, report_requested_to, or client_progress';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profile_advocate_fields_trg ON public.profiles;
CREATE TRIGGER guard_profile_advocate_fields_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_advocate_fields();

CREATE OR REPLACE FUNCTION public.bump_client_progress(_client_id uuid, _delta int, _cap int DEFAULT 75)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_val smallint;
  new_val int;
  caller uuid := auth.uid();
  is_advocate boolean := public.has_role(caller, 'advocate');
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT is_advocate AND caller <> _client_id THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT client_progress INTO current_val FROM public.profiles WHERE id = _client_id FOR UPDATE;
  IF current_val IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  new_val := current_val + _delta;
  IF new_val < 0 THEN new_val := 0; END IF;
  IF new_val > 100 THEN new_val := 100; END IF;

  -- Client-action cap: never push above _cap when called by client
  IF NOT is_advocate AND new_val > _cap THEN
    new_val := GREATEST(current_val, LEAST(_cap, new_val));
    IF current_val >= _cap THEN
      new_val := current_val;
    END IF;
  END IF;

  UPDATE public.profiles SET client_progress = new_val WHERE id = _client_id;
  RETURN new_val::smallint;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_report_progress(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.profiles
    SET report_progress = 0,
        report_status = 'updating'
    WHERE id = _client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_client_progress(uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.bump_client_progress(uuid, int, int) TO authenticated;
REVOKE ALL ON FUNCTION public.reset_report_progress(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reset_report_progress(uuid) TO authenticated;
