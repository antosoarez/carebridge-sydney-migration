# Fix: clients invisible in advocate's Clients list

## Step 1 — Diagnosis (per link in the chain)

a) **profiles row with role='client'** — ✅ created. `handle_new_user()` trigger (migration `20260516101733`) inserts a row into `public.profiles` and a row into `public.user_roles` with role `'client'` for every new auth user (advocate is only the fixed `hello@carebridgeperth.com` email).

b) **advocate_id / owner on profile** — N/A. This codebase is single-advocate: there is no per-client `advocate_id` column on `profiles`. The advocate is resolved everywhere via `SELECT user_id FROM user_roles WHERE role='advocate' ORDER BY created_at LIMIT 1` (see `message_threads` seeding, availability requests, etc.). No change needed.

c) **lifecycle_status after onboarding** — partially. Column defaults to `'New enquiry'` and migration `20260612064353` backfilled `'Active'` for any user with `activated_at IS NOT NULL`. The advocate's Clients list does NOT filter on lifecycle, so this is not what's hiding clients — but we'll still backfill stragglers.

d) **Clients list query** — `src/lib/clients-store.ts` runs:
```
supabase.from('user_roles').select('user_id').eq('role','client')
```
then loads `profiles` for those ids. No filter by `advocate_id` (correct for single-advocate). The query is fine **if** the advocate is allowed to read those `user_roles` rows.

e) **RLS on user_roles** — 🔴 **BROKEN LINK**. The only SELECT policy on `public.user_roles` is:
```
USING (auth.uid() = user_id)
```
(migration `20260516101733` line 25-28). Advocates can therefore only see *their own* role row, so the query in (d) returns an empty list and the Clients page is always empty — regardless of how many clients have been created or onboarded.

`profiles` itself has an advocate-wide SELECT policy, but the list never gets to `profiles` because step (d) finds zero ids first.

## Step 2 — Fix

New migration adds an advocate-wide SELECT policy on `user_roles` (mirroring the existing `profiles` policy), using the `has_role` security-definer to avoid recursion:

```sql
CREATE POLICY "Advocates can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));
```

No client/edge-function code changes are needed — `admin-create-client` already creates the auth user, and the existing `handle_new_user` trigger inserts the `profiles` row + `user_roles('client')` row. Once the advocate can read those role rows, `useClients()` returns the full list.

## Step 3 — Backfill (same migration)

Idempotent fix-ups for any historical users stuck because the trigger didn't run, or lifecycle was never set:

```sql
-- a) Ensure every auth.users row has a profiles row
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name','')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- b) Ensure every profile has at least one user_roles row
-- (advocate = fixed email, everyone else = client)
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

-- c) Lifecycle backfill for clients who completed onboarding but stayed on default
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

## Step 4 — Verify

After the migration runs:
- Re-open `/advocate/clients`. The empty-state should disappear; converted/onboarded testers appear with name, email, lifecycle pill, status pill.
- Clicking a card navigates to `/advocate/client/:id` (existing route, already permitted by the `profiles` "Advocates can view all profiles" policy).
- No messaging/attachments/agreements code is touched.

## Files

- **NEW** `supabase/migrations/<timestamp>_advocate_roles_visibility.sql` — the policy + backfill above.
- No frontend changes. No edge-function changes.

## Technical notes

- Policy uses `has_role(auth.uid(),'advocate')` (SECURITY DEFINER) to stay consistent with the existing `profiles` policy and avoid recursive RLS on `user_roles`.
- The new policy is SELECT-only; the existing "Deny insert/update/delete to user_roles" policies remain, so advocates still cannot escalate privileges through the client.
- Backfill statements are guarded with `LEFT JOIN ... IS NULL` / `ON CONFLICT DO NOTHING`, safe to re-run.
