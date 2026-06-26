CREATE TYPE public.client_payment_status AS ENUM ('unpaid', 'half_paid', 'full_paid');

ALTER TABLE public.profiles
  ADD COLUMN payment_status public.client_payment_status NOT NULL DEFAULT 'unpaid';

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
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, client_colour, or payment_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profile_advocate_fields_trg ON public.profiles;
CREATE TRIGGER guard_profile_advocate_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_advocate_fields();