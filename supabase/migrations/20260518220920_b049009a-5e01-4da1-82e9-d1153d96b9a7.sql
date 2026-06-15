
CREATE TABLE IF NOT EXISTS public.client_internal_notes (
  client_id uuid PRIMARY KEY,
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.client_internal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Advocates manage internal notes" ON public.client_internal_notes;
CREATE POLICY "Advocates manage internal notes"
ON public.client_internal_notes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'advocate'))
WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE OR REPLACE FUNCTION public.touch_client_internal_notes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_client_internal_notes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS touch_client_internal_notes_t ON public.client_internal_notes;
CREATE TRIGGER touch_client_internal_notes_t
BEFORE INSERT OR UPDATE ON public.client_internal_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_client_internal_notes();
