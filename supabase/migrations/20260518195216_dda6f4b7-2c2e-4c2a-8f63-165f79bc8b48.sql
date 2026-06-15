
CREATE TYPE public.report_review_status AS ENUM ('draft','shared_for_review','agreed');

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  created_by uuid NOT NULL,
  title text NOT NULL,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  status public.report_review_status NOT NULL DEFAULT 'draft',
  shared_at timestamptz,
  client_agreed_at timestamptz,
  client_feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_client_created ON public.reports(client_id, created_at);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates view all reports" ON public.reports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advocate') AND created_by = auth.uid());

CREATE POLICY "Advocates update reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete reports" ON public.reports
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Clients view own shared/agreed reports" ON public.reports
  FOR SELECT TO authenticated
  USING (auth.uid() = client_id AND status IN ('shared_for_review','agreed'));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_reports_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_reports_updated_at
BEFORE UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.touch_reports_updated_at();

-- RPCs
CREATE OR REPLACE FUNCTION public.share_report_for_review(_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.reports
    SET status = 'shared_for_review',
        shared_at = COALESCE(shared_at, now()),
        client_agreed_at = NULL
    WHERE id = _report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_report_to_draft(_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.reports
    SET status = 'draft',
        client_agreed_at = NULL
    WHERE id = _report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agree_report(_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reports%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = _report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> r.client_id THEN
    RAISE EXCEPTION 'Only the client can confirm this report';
  END IF;
  IF r.status <> 'shared_for_review' THEN
    RAISE EXCEPTION 'Report is not awaiting your review';
  END IF;
  UPDATE public.reports
    SET status = 'agreed',
        client_agreed_at = now()
    WHERE id = _report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_back_report(_report_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reports%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = _report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> r.client_id THEN
    RAISE EXCEPTION 'Only the client can send this back';
  END IF;
  IF r.status <> 'shared_for_review' THEN
    RAISE EXCEPTION 'Report is not awaiting your review';
  END IF;
  UPDATE public.reports
    SET client_feedback = _note,
        client_agreed_at = NULL
    WHERE id = _report_id;
END;
$$;
