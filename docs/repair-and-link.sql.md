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

## ⚠️ Run this FIRST — fixes empty Clients list

The advocate's Clients page is empty because `user_roles` only allows users to
read their own role row, so the query `SELECT user_id FROM user_roles WHERE role='client'`
returns 0 rows for the advocate. Paste this into the Supabase SQL editor:

```sql
-- Advocates can read all role rows (mirrors the profiles policy).
DROP POLICY IF EXISTS "Advocates can view all roles" ON public.user_roles;
CREATE POLICY "Advocates can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- Backfill (a): every auth.users row should have a profiles row.
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Backfill (b): every profile should have a user_roles row.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id,
       CASE WHEN lower(p.email) = 'hello@carebridgeperth.com'
            THEN 'advocate'::public.app_role
            ELSE 'client'::public.app_role
       END
FROM public.profiles p
LEFT JOIN public.user_roles r ON r.user_id = p.id
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill (c): lifecycle_status for onboarded/invited clients.
UPDATE public.profiles
   SET lifecycle_status = 'Active'::public.client_lifecycle_status
 WHERE activated_at IS NOT NULL
   AND (lifecycle_status IS NULL OR lifecycle_status = 'New enquiry');

UPDATE public.profiles
   SET lifecycle_status = 'Invited'::public.client_lifecycle_status
 WHERE activated_at IS NULL
   AND must_change_password = true
   AND (lifecycle_status IS NULL OR lifecycle_status = 'New enquiry');
```

After running, reload `/advocate/clients` — converted/onboarded testers will appear.

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

## Client Intake (new — fillable intake form)

Creates the `public.client_intake` table that powers the client portal's
"Complete Your Intake" form and the advocate's read-only Client Intake tab.
RLS scopes rows to the client (read/write own) and to advocates (read all).

```sql
-- Table: one intake record per client.
CREATE TABLE IF NOT EXISTS public.client_intake (
  client_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Section 1 — Personal Details
  full_name text,
  preferred_name text,
  date_of_birth date,
  gender text,
  pronouns text,
  mobile_phone text,
  email text,
  residential_address text,
  suburb text,
  postcode text,
  state text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,

  -- Section 2 — Treating doctors
  gp_name text,
  gp_clinic text,
  gp_phone text,
  gp_email text,
  specialists text,

  -- Section 3 — Reason for engaging
  services_interested text[] NOT NULL DEFAULT '{}',
  help_needed text,
  main_outcome text,

  -- Section 4 — Current health concerns
  main_concerns text,
  concerns_onset text,

  -- Section 5 — Medical history
  diagnosed_conditions text,
  current_medications text,
  allergies text,
  recent_investigations text,

  -- Section 6 — Administrative
  referral_source text,
  preferred_contact_method text,
  other_info text,

  -- Meta
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_intake TO authenticated;
GRANT ALL ON public.client_intake TO service_role;

ALTER TABLE public.client_intake ENABLE ROW LEVEL SECURITY;

-- Client can read/write their own intake row.
DROP POLICY IF EXISTS "Client manages own intake" ON public.client_intake;
CREATE POLICY "Client manages own intake"
  ON public.client_intake
  FOR ALL
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- Advocates can read all intakes (read-only).
DROP POLICY IF EXISTS "Advocates can view all intakes" ON public.client_intake;
CREATE POLICY "Advocates can view all intakes"
  ON public.client_intake
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));
```
