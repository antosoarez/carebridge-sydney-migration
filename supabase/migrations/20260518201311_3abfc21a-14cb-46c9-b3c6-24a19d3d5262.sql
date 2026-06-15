-- New enums
DO $$ BEGIN
  CREATE TYPE public.report_stage AS ENUM ('draft','v1','v2','v3','finalised','updated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_visibility AS ENUM ('private','shared');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Columns
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS stage public.report_stage NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS visibility public.report_visibility NOT NULL DEFAULT 'private';

-- Backfill from legacy status
UPDATE public.reports SET visibility = 'shared'
  WHERE status IN ('shared_for_review','agreed') AND visibility = 'private';

-- Replace client SELECT policy with a visibility-based one
DROP POLICY IF EXISTS "Clients view own shared/agreed reports" ON public.reports;
CREATE POLICY "Clients view own shared reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id AND visibility = 'shared');

-- Convenience RPC for advocate to set stage + visibility in one shot
CREATE OR REPLACE FUNCTION public.set_report_stage_visibility(
  _report_id uuid,
  _stage public.report_stage,
  _visibility public.report_visibility
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.reports
    SET stage = _stage,
        visibility = _visibility,
        status = CASE
          WHEN _visibility = 'shared' AND status = 'draft' THEN 'shared_for_review'::report_review_status
          WHEN _visibility = 'private' AND status = 'shared_for_review' THEN 'draft'::report_review_status
          ELSE status
        END,
        shared_at = CASE
          WHEN _visibility = 'shared' AND shared_at IS NULL THEN now()
          ELSE shared_at
        END
    WHERE id = _report_id;
END; $$;