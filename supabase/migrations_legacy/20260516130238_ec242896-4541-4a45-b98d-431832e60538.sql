
-- ============ DOCUMENTS ============
CREATE TYPE public.document_status AS ENUM ('pending_review', 'triaged', 'archived');

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  uploaded_by UUID NOT NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  status public.document_status NOT NULL DEFAULT 'pending_review',
  triaged_at TIMESTAMPTZ,
  triaged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own documents"
  ON public.documents FOR SELECT TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Clients insert own documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id AND auth.uid() = uploaded_by);

CREATE POLICY "Advocates view all documents"
  ON public.documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates update all documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER TABLE public.documents REPLICA IDENTITY FULL;

-- ============ APPOINTMENTS ============
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Advocates view all appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates insert appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates update appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

CREATE POLICY "Advocates delete appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- ============ STORAGE ============
INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false);

CREATE POLICY "Clients upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Clients read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Advocates read all client documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.has_role(auth.uid(), 'advocate')
  );

CREATE POLICY "Advocates manage all client documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.has_role(auth.uid(), 'advocate')
  );
