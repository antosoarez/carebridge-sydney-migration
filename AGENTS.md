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
- `supabase/` (config.toml, 82 migrations, 28 Deno edge functions) targets a *different* project_id than `.env`.
  Running the local Supabase stack (`supabase start`) is **optional** and requires the Supabase CLI + Docker;
  it is not needed for frontend development against the hosted project.
