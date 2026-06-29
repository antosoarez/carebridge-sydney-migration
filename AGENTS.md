# AGENTS.md

## Cursor Cloud specific instructions

CareBridge Perth is a single-page React + TypeScript app (Vite + shadcn/ui + Tailwind) that talks
directly to a **hosted Supabase project** for auth, Postgres (with RLS), storage, and edge functions.
There is no separate local backend to run for normal frontend development — the Supabase URL and
publishable key are committed in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).

### Package manager
- This repo uses **Bun** (`bun.lock`), not npm/yarn/pnpm. Bun is not preinstalled on the base image;
  the startup update script installs it. If `bun` is missing in a shell, it lives at `~/.bun/bin/bun`
  (run `export PATH="$HOME/.bun/bin:$PATH"`). The install also appends this to `~/.bashrc`.

### Commands (see `package.json` scripts)
- Dev server: `bun run dev` → http://localhost:8080 (Vite host `::`, fixed port 8080).
- Build: `bun run build` (prod) or `bun run build:dev`. Preview: `bun run preview`.
- Tests: `bun run test` (Vitest, jsdom). Watch: `bun run test:watch`.
- Lint: `bun run lint` (ESLint flat config).

### Gotchas
- `bun run lint` currently reports many **pre-existing** errors/warnings (mostly `@typescript-eslint/no-explicit-any`
  in `supabase/functions/**` Deno code and a couple in `tailwind.config.ts`). These are not from environment
  setup; do not treat a non-zero lint exit as a broken environment.
- The hosted Supabase backend means public flows like `/contact` (enquiry intake) and login work without
  running anything locally. A good smoke test is submitting the `/contact` form, which writes to the
  `inbound_messages` table and shows a "Message received" confirmation.
- Authenticated advocate/client routes require real Supabase accounts; there are no seeded local creds.

### Backend: Supabase migrations & edge-function deploys (canonical = Sydney)
The single canonical project is **`dkfjmtysfuqtdpaqpxsd`** (Sydney, `ap-southeast-2`), matching `.env` and
`supabase/config.toml`. The old Seoul project `umuvklhpppuchijbvsae` is **abandoned** — ignore it. Lovable no
longer manages this project's schema; **Supabase CLI `db push` is the sole deploy authority**. Pre-cutover
Lovable migrations are archived in `supabase/migrations_legacy/` (do not re-apply); the active
`supabase/migrations/` starts from `..._baseline_remote_schema.sql` (the live schema, marked already-applied).

Operating notes (this VM has **no Docker** and the kernel has **no `tun` module**, so rootless container
networking fails). Required secrets: `SUPABASE_DB_PASSWORD` (or a full `SUPABASE_DB_URL`), `SERVICE_ROLE_KEY`
(new-format `sb_secret_…`), and `SUPABASE_ACCESS_TOKEN` (`sbp_…`) for function deploys.
- Server is **Postgres 17** — use a v17 `pg_dump`/`psql` (PGDG repo), not the distro's 16.
- Connect via the **session pooler** `postgresql://postgres.dkfjmtysfuqtdpaqpxsd:<pw>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres` (the direct `db.<ref>.supabase.co` host is IPv6-only and unreachable here).
- Migrations: `supabase db push --db-url "$SUPABASE_DB_URL"` (and `--dry-run` first). `db pull`/`db dump` need Docker — avoid; use `pg_dump` directly for schema snapshots.
- Edge functions: deploy with **`supabase functions deploy <name> --use-api`** (server-side bundling). Plain `functions deploy` tries a local podman build and fails on rootless netns here.
- `supabase gen types typescript --db-url …` works only because `podman` is installed (it runs `postgres-meta` with `--network host`).
- **Guard caveat:** `guard_profile_advocate_fields()` blocks `lifecycle_status`/tier/etc. writes unless the
  actor is an advocate or the txn GUC `app.recomputing_progress='on'` is set. Service-role/system code that must
  change these fields should go through a `SECURITY DEFINER` function that sets that GUC (e.g. `run_automations`,
  `mark_client_invited`) rather than writing the column directly.

Running the full local stack (`supabase start`) needs Docker and is **not** required for frontend dev.

### Automation engine & notification bridge
- Lifecycle automations run through `run_automations()` (SECURITY DEFINER, service_role-only),
  driven by triggers on profiles/appointments/agreements/payments/documents and seeded
  `automation_rules`/`automation_rule_actions`. Inspect runs in `automation_runs`.
- Notifications: the `notify` action enqueues client-safe rows into `automation_outbox` (no PHI).
  The `dispatch-automation-outbox` edge function drains it (Resend email + in-app) and is triggered
  every minute by the `dispatch-automation-outbox` pg_cron job. Auth is a shared token that must match
  in two places: the function secret `OUTBOX_DISPATCH_TOKEN` and the Vault secret `outbox_dispatch_token`
  (the cron reads the Vault value). If you rotate it, update both.
- Note: the older Lovable HTTP crons (e.g. `queue-appointment-reminders`) still point at the dead Seoul
  URL with a missing vault secret, so they are no-ops; reminder delivery there needs re-pointing if revived.
