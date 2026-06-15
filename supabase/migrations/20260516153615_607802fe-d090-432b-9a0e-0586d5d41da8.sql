
CREATE TYPE public.template_audience AS ENUM ('patient', 'clinic', 'both');

CREATE TABLE public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  audience public.template_audience NOT NULL DEFAULT 'patient',
  storage_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advocates view templates" ON public.document_templates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert templates" ON public.document_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advocate') AND auth.uid() = created_by);

CREATE POLICY "Advocates update templates" ON public.document_templates
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete templates" ON public.document_templates
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Advocates read templates bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'templates' AND public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates upload to templates bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'templates' AND public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete from templates bucket"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'templates' AND public.has_role(auth.uid(), 'advocate'));
