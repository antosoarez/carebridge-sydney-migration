# Fix: Clients can't finish onboarding

## Root cause

`src/pages/ClientOnboarding.tsx` step 4 ("Finish") does two writes:

1. `INSERT` into `public.client_consents` (line 75) — **table does not exist** in the live DB → PostgREST returns `Could not find the table 'public.client_consents' in the schema cache` → onboarding aborts, client is stuck.
2. `UPDATE public.profiles` with `onboarding_completed_at`, `preferred_name`, `preferred_language`, `preferred_contact_method` — **columns do not exist** → would fail right after the consent insert anyway.

Same root cause as Part 1: the June 15 migrations were never applied to the live project. The already-written file `supabase/migrations/20260616000000_repair_missing_tables.sql` creates `client_consents` (with the correct RLS — `INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`, `SELECT` own rows, no UPDATE/DELETE) and adds the missing `profiles` columns, which unblocks the flow.

The privacy link in `ClientOnboarding.tsx` line 229 already points to `https://carebridgeperth.com/privacy.html` with `target="_blank" rel="noopener noreferrer"` — no code change needed.

## Plan

1. **Apply** `supabase/migrations/20260616000000_repair_missing_tables.sql` to the live database (single idempotent migration; safe to re-run). This:
   - Adds missing `profiles` columns.
   - Creates `client_consents` + RLS (authenticated insert/select own; service_role all; no update/delete — append-only audit).
   - Creates the other 6 missing tables (`client_navigation_intake`, `agreement_documents`, `client_agreement_acceptances`, `automation_rules`, `automation_rule_actions`, `document_templates`) + `templates` storage bucket + `client_has_all_required_agreements()` helper + seed data.
   - GRANTs to `authenticated` / `service_role` per public-schema rules.
   - No `run_automations` trigger, no `client_lifecycle_status` changes, no `client_cases` column changes.

2. **Verify** by walking onboarding step 3 → 4 → Finish as an authenticated client:
   - Consent insert succeeds (no schema-cache error).
   - Profile update succeeds.
   - Redirect to `/client/navigation-intake`.
   - "Read our full Privacy Notice" opens `https://carebridgeperth.com/privacy.html` in a new tab.

## Blocker

Applying the migration requires Lovable Cloud to be enabled for this workspace. It is currently disabled, so I cannot run the SQL against the database from here.

**To unblock:** Connectors → Lovable Cloud → Tool Permissions → set **Enable Lovable Cloud** to *Always allow* (or *Ask each time*), then reply "go". I'll apply the migration and verify the onboarding flow end-to-end.

The migration file itself is already written and ready — no further code changes are needed for the bug fix.
