-- 1. Comments table
CREATE TABLE IF NOT EXISTS public.report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('advocate','client')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_comments_report ON public.report_comments(report_id, created_at);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates view all report comments"
  ON public.report_comments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert report comments"
  ON public.report_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'advocate')
    AND author_id = auth.uid()
    AND author_role = 'advocate'
  );

CREATE POLICY "Advocates delete report comments"
  ON public.report_comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Clients view comments on their shared reports"
  ON public.report_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_comments.report_id
        AND r.client_id = auth.uid()
        AND r.visibility = 'shared'
    )
  );

CREATE POLICY "Clients post comments on their shared reports"
  ON public.report_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND author_role = 'client'
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_comments.report_id
        AND r.client_id = auth.uid()
        AND r.visibility = 'shared'
    )
  );

-- 2. Storage: lock /reports/ path to advocates
-- Carve out the reports sub-path: clients can no longer write there.
DROP POLICY IF EXISTS "Clients upload to own folder" ON storage.objects;
CREATE POLICY "Clients upload to own folder (non-reports)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND (storage.foldername(name))[2] IS DISTINCT FROM 'reports'
  );