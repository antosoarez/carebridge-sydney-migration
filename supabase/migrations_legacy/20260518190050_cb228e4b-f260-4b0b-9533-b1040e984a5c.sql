ALTER TABLE public.profiles
  ADD COLUMN report_progress smallint NOT NULL DEFAULT 0
  CHECK (report_progress >= 0 AND report_progress <= 100);

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
       OR NEW.report_progress IS DISTINCT FROM OLD.report_progress THEN
      RAISE EXCEPTION 'Only advocates can change tier, report_status, client_colour, payment_status, or report_progress';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;