## What this plan does

I write **every** change as a file in your repo: SQL migration, new React components, and edited edge function source. Nothing touches the live database, storage, or deployed functions. When you enable Cloud (or paste the SQL into the Supabase SQL editor yourself), the app lights up.

**Up-front warning, so there are no surprises:** until the migration runs, the new UI tabs will show empty states or error toasts where they query missing tables. The existing app continues to work as it does today — I am not removing anything.

---

## Part 1 — Client linkage + intake visibility

### Migration file: `supabase/migrations/20260616120000_repair_and_link.sql`

One idempotent migration. Sections:

1. **`profiles` columns** (ADD COLUMN IF NOT EXISTS): `role` (default `'client'`), `lifecycle_stage`, `advocate_id uuid REFERENCES auth.users`, `onboarding_completed_at`, `preferred_name`, `preferred_language`, `preferred_contact_method`, `navigation_intake_seen_at`.
2. **Tables** (CREATE TABLE IF NOT EXISTS, with GRANTs + RLS):
   - `client_consents` (append-only audit: scope ack + privacy consent + timestamp)
   - `client_navigation_intake` (Part B answers: help_with, whats_going_on, steps_taken, what_matters_most, updated_at)
   - `agreement_documents` (Service Agreement / Privacy Notice / Scope Ack / Recording Consent — seeded)
   - `client_agreement_acceptances` (which client accepted which doc, when)
   - `message_threads` (unique per client/advocate pair)
   - `messages` (thread_id, sender_id, body, created_at)
   - `message_attachments` (message_id, storage_path, filename, content_type, size_bytes)
3. **RLS policies**:
   - `profiles`: advocate can SELECT rows where `advocate_id = auth.uid()`; client can SELECT/UPDATE their own row.
   - `client_consents`, `client_navigation_intake`, `client_agreement_acceptances`: client RW own rows; advocate SELECT on rows whose `user_id` profile has `advocate_id = auth.uid()` (via `has_advocate_link(uuid)` SECURITY DEFINER helper to avoid recursion).
   - `message_threads` / `messages` / `message_attachments`: only the two participants.
4. **Triggers**:
   - On profile insert/update where `advocate_id` becomes non-null → insert `message_threads` row (ON CONFLICT DO NOTHING).
   - On profile `onboarding_completed_at` set → ensure `client_cases` row exists.
5. **Storage**: `INSERT INTO storage.buckets` for `message-attachments` (private). RLS on `storage.objects` restricted to thread participants via `message_attachments` join.
6. **Backfill** (the 3 existing clients): a generic block that UPDATEs every existing `profiles` row with `role='client' AND advocate_id IS NULL` to set `advocate_id = (SELECT id FROM profiles WHERE role='advocate' LIMIT 1)` and `lifecycle_stage='active'`. The trigger above then auto-creates threads/cases.

I will write the full SQL but **not apply it**.

### Edge function: `supabase/functions/admin-create-client/index.ts`

Edit the profile-insert block so newly created clients get `role='client'`, `lifecycle_stage='active'`, and `advocate_id = <calling advocate's uid>`. Source-only edit; needs deploy to take effect.

### Edge function: `supabase/functions/queue-message-notifications/index.ts`

Strip any message-body content from the notification payload. Send only "You have a new message — log in to view." plus a deep link. Source-only edit; needs deploy.

### New React components (these render gracefully when tables are missing — empty state, not crash)

- `src/components/ocean/NavigationIntakeTab.tsx` — read-only display of: consents (✓/pending + timestamp), about-you (preferred name/language/contact), Part B answers. Wrapped in try/catch on the query; shows "No intake submitted yet" on PGRST error or empty.
- `src/components/ocean/AgreementStatusList.tsx` — 4 fixed rows (Service Agreement, Privacy Notice, Scope Acknowledgment, Recording Consent) with Accepted/Pending chip + timestamp.
- Mount both inside `src/pages/AdvocateClientDetail.tsx` as a new "Intake" tab (using the existing `Tabs` shadcn component already used on that page).

### Updated `src/pages/ClientOnboarding.tsx`

On Finish: in addition to existing logic, write `advocate_id` to the client's profile (using a `get_default_advocate()` RPC defined in the migration that returns the single advocate's id). Existing privacy-link fix stays.

---

## Part 2 — Messaging

### Migration (included in the same SQL file above)

`message_threads` + `messages` tables, RLS, auto-thread trigger — already in the SQL block above.

### Client-side store changes

- `src/lib/messages-store.ts`: replace the localStorage implementation with a Supabase-backed one (`message_threads` + `messages` + realtime subscription on `messages` filtered by `thread_id`).
- Same hook signatures (`useThread`, `useThreadSummaries`, `useUnreadTotal`) so `Messages.tsx`, `AdvocateClientDetail.tsx`, `InboundInbox.tsx` keep working unchanged.

---

## Part 3 — Attachments

### New file: `src/lib/attachments-store.ts`

- `uploadAttachment(threadId, messageId, file)` — validates type (pdf/jpg/png/heic/webp/docx/xlsx/txt) and size (≤25 MB), uploads to `message-attachments/<threadId>/<messageId>/<uuid>-<filename>`, inserts `message_attachments` row.
- `getSignedUrl(path)` — returns a 60-second signed URL.

### Updated `src/pages/Messages.tsx` + `src/pages/AdvocateClientDetail.tsx` message composer

- Paperclip button → file picker (multi).
- Below input: pending attachments list with remove (✕).
- In bubbles: image attachments rendered as thumbnails (lazy-loaded via signed URL); non-image as `<a download>` with filename + size.
- 25 MB / type validation client-side with toast on failure.

### Region note

Bucket is created in your project's existing Supabase region. If your project is already provisioned in **ap-southeast-2 (Sydney)** the bucket is Sydney by default; if it's elsewhere the bucket lives there. Storage region is set per-project at creation time — I can't change it from a migration. Tell me if you want me to verify your project's region in the plan output.

---

## Files written by this plan

```
supabase/migrations/20260616120000_repair_and_link.sql      (NEW)
supabase/functions/admin-create-client/index.ts             (edit)
supabase/functions/queue-message-notifications/index.ts     (edit)
src/components/ocean/NavigationIntakeTab.tsx                (NEW)
src/components/ocean/AgreementStatusList.tsx                (NEW)
src/pages/AdvocateClientDetail.tsx                          (edit — add tab)
src/pages/ClientOnboarding.tsx                              (edit — set advocate_id)
src/lib/messages-store.ts                                   (rewrite — Supabase-backed)
src/lib/attachments-store.ts                                (NEW)
src/pages/Messages.tsx                                      (edit — attachment composer)
```

## What won't work until you enable Cloud (or paste SQL manually)

- New Intake tab → "No intake submitted yet" until the migration runs.
- Agreement chips → all "Pending" until the migration runs.
- Messaging send → toast error "Could not find table public.messages" until the migration runs.
- Attachments → upload fails (bucket missing) until the migration runs.
- Edge function changes (`admin-create-client`, `queue-message-notifications`) → live functions keep running old code until deploy.

The moment Cloud is enabled, I run the migration + redeploy the two edge functions and everything turns on. No further code changes needed.

## Out of scope

- Push notifications for messages (existing chime/toast logic is untouched).
- Migrating the 3 existing clients' historical localStorage messages into the new DB-backed thread (they start fresh; tell me if you want a one-time import).
