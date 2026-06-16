# Repair & Link — manual SQL to run when Cloud is re-enabled

This SQL covers everything not yet in your live database:

1. Re-runs the (idempotent) consents / intake / agreements / automation
   migrations from June 15 in case the live DB never received them.
2. Backfills any `auth.users` that lack a `user_roles` row with role
   `'client'` so the advocate's clients list returns them.
3. Adds the new `public.message_attachments` table + RLS so message
   attachments are scoped to the two people in the thread.
4. Creates the private `message-attachments` storage bucket with the
   same membership-based RLS on `storage.objects`.

Run order: simply paste **`supabase/migrations/20260615120000_client_onboarding.sql`**,
**`supabase/migrations/20260615130000_client_navigation_intake.sql`**, and
**`supabase/migrations/20260615200001_automation_engine.sql`** into the
Supabase SQL editor in that order, then the block below.

All statements are idempotent — safe to re-run.

```sql
-- =====================================================================
-- Repair + link: backfill user_roles, add message_attachments,
-- private "message-attachments" storage bucket with thread-scoped RLS.
-- =====================================================================

-- 1) Backfill user_roles for any profile without a role row
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'client'::public.app_role
FROM public.profiles p
LEFT JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 2) message_attachments
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_thread ON public.message_attachments(thread_id);

GRANT SELECT, INSERT ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "thread members read attachments" ON public.message_attachments;
CREATE POLICY "thread members read attachments"
  ON public.message_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = message_attachments.thread_id
        AND (t.client_id = auth.uid() OR t.advocate_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "uploader inserts own attachments" ON public.message_attachments;
CREATE POLICY "uploader inserts own attachments"
  ON public.message_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploader_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id = message_attachments.thread_id
        AND (t.client_id = auth.uid() OR t.advocate_id = auth.uid())
    )
  );

-- 3) Private storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  26214400,
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 4) RLS on storage.objects for the bucket
DROP POLICY IF EXISTS "thread members read message attachments" ON storage.objects;
CREATE POLICY "thread members read message attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.message_attachments a
      JOIN public.message_threads t ON t.id = a.thread_id
      WHERE a.storage_path = storage.objects.name
        AND (t.client_id = auth.uid() OR t.advocate_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "thread members upload message attachments" ON storage.objects;
CREATE POLICY "thread members upload message attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND owner = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.message_threads t
      WHERE t.id::text = split_part(storage.objects.name, '/', 1)
        AND (t.client_id = auth.uid() OR t.advocate_id = auth.uid())
    )
  );
```

## How to apply

When Lovable Cloud is re-enabled, ask the agent to run this SQL via the
migration tool — or paste it directly into the Supabase dashboard SQL
editor and run it.

## What it does NOT do

- It does NOT weaken any existing RLS policy on `profiles`, `messages`,
  or `message_threads`.
- It does NOT modify any user data; the backfill only inserts a
  `user_roles` row for users who have no role yet.
- It does NOT replace the existing localStorage messages store; that
  store is unused (the messaging UI already uses Supabase).
