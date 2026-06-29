GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_requests TO authenticated;
GRANT ALL ON public.availability_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_options TO authenticated;
GRANT ALL ON public.availability_options TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_availability_preferences TO authenticated;
GRANT ALL ON public.client_availability_preferences TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_contact_logs TO authenticated;
GRANT ALL ON public.clinic_contact_logs TO service_role;