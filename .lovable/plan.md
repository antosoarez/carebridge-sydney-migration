# CareBridge Automation Engine

A server-side, data-driven automation system on Supabase. Rules are stored as rows, evaluated by triggers + a dispatcher edge function, so new rules can be added later without code changes.

## 1. Lifecycle model

Add a single source of truth for client stage. New enum + column on `clients`:

`client_lifecycle_stage`:
`new_enquiry → booked → awaiting_agreements → awaiting_payment → active → waiting_on_clinic → on_hold → closed`

- Add `lifecycle_stage` and `lifecycle_stage_changed_at` to `clients`.
- Trigger keeps `lifecycle_stage_changed_at` fresh on every stage change.
- Insert `client_lifecycle_events` audit row on every change (old_stage, new_stage, reason, actor).

## 2. Agreements (signing gate)

New tables:

- `agreement_documents` — id, slug (`service_agreement`, `privacy_notice`, `scope_acknowledgment`, `recording_consent`), title, body_md, version, required (bool), active (bool).
- `client_agreement_acceptances` — id, client_id, document_id, document_version, accepted_at, accepted_by_user_id, ip, user_agent, method (`checkbox_v1`, future `esign_*`).

A helper SQL function `public.client_has_all_required_agreements(_client_id)` returns true when one acceptance row exists per active required document at its current version. Used by trigger to advance lifecycle to `awaiting_payment`.

Seed the 4 documents with v1 plain-language bodies. Recording consent is `required = false` by default.

## 3. Payments

- Add `external_payment_link_url` to `client_fee_arrangements` (advocate copies it to send).
- Add `payment_gate_unlocked_at` to `clients` (set when all agreements accepted).
- Keep manual mark-as-received in existing `client_payments` flow.
- Block the UI "send payment" action until `payment_gate_unlocked_at IS NOT NULL`.
- Overdue detection: existing `isOverdueSevenDays` already used; surface a count in dashboard "Payment outstanding".

## 4. Free discovery call

- Add seeded category `free_discovery_call` to `appointments.category` (free-text already).
- New appointment dialog gets a "Free discovery call" quick-pick that prefills duration 20 min, fee 0, type label.
- Completing one (`status = completed`) fires the lifecycle automation.

## 5. Automation engine (data-driven)

Two tables to make rules editable, not hard-coded:

- `automation_rules` — id, slug, name, trigger_kind (enum: `enquiry_created`, `appointment_booked`, `appointment_completed`, `agreements_completed`, `payment_received`, `stage_timeout`, `document_uploaded`, `stage_changed`), trigger_config jsonb (e.g. `{appointment_category:'free_discovery_call'}`, `{stage:'awaiting_agreements', after_days:3}`), enabled bool, priority int.
- `automation_rule_actions` — id, rule_id, action_kind (`set_stage`, `create_task`, `create_calendar_event`, `increment_metric`, `grant_portal_access`, `start_onboarding`), action_config jsonb, sort_order.
- `automation_runs` — id, rule_id, client_id, triggered_at, status (`ok`/`error`), detail jsonb (idempotency log).

Execution:
- Postgres triggers on `clients`, `appointments`, `client_payments`, `client_agreement_acceptances`, `documents`, `inbound_messages` call `pg_notify('automation_event', json)` AND insert into `automation_event_queue`.
- A single edge function `automation-dispatch` is invoked (via `supabase_functions.http_request` from a statement trigger, or pg_cron every minute for time-based rules). It reads pending events, matches them against enabled `automation_rules`, runs the listed actions transactionally, writes `automation_runs`.
- Time-based rules (`stage_timeout`) handled by pg_cron job every 15 min calling the same dispatcher with `{kind:'tick'}`.

Idempotency: unique `(rule_id, client_id, event_id)` index on `automation_runs`.

Seed rules table with the 10 lifecycle rules from the brief so they appear immediately and are editable later.

## 6. Public enquiry webhook

New edge function `enquiry-webhook` (public, no JWT). It:

1. CORS allowlist (`carebridgeperth.com`, www, preview).
2. Validates with zod: name (≤100), email, phone (optional), message (≤2000), source.
3. Honeypot + in-memory IP rate limit (reuse `submit-enquiry` pattern).
4. Verifies an HMAC header `x-cb-signature` against secret `ENQUIRY_WEBHOOK_SECRET` so only the marketing site can post.
5. Inserts an `inbound_messages` row AND a `clients` row in stage `new_enquiry` (or finds existing by email).
6. Returns 200 with `{ ok: true }`. Automation trigger fires the rest.

## 7. Dashboard counters

Existing `DashboardCountCards` already reads counts from RPC. Update `calculate_client_urgency` / count queries to include:
- `new_enquiries` = clients in `new_enquiry`
- `appointments_this_week` = appointments where category=`free_discovery_call` next 7 days
- `active_clients` = stage `active`
- `payment_outstanding` = overdue payments

No UI overhaul — keep the calm layout.

## 8. UI surfaces (minimal, presentation-only on top of new data)

- `AdvocateClientDetail`: a "Lifecycle" strip showing current stage and a "Required agreements" mini-list with status per document. Advocate can also tick acceptance on the client's behalf with a note.
- `Settings → Automations`: read-only list of rules with on/off toggle (full editor deferred).
- `Payments`: shows `external_payment_link_url` with copy button; disabled until gate unlocked, with tooltip "Awaiting agreements".
- Client portal onboarding: add an "Agreements" step that lists required docs and a checkbox per doc, stores acceptances.

## Technical details

Files to create:
```
supabase/migrations/20260615200000_automation_engine.sql
  - enums, tables, triggers, helper fns, seed rules + agreement docs, RLS + GRANTS
supabase/functions/enquiry-webhook/index.ts
supabase/functions/automation-dispatch/index.ts
src/lib/lifecycle.ts            stage labels, helpers
src/lib/agreements-store.ts     hook for documents + acceptances
src/lib/automation-store.ts     read rules for settings UI
src/components/ocean/ClientLifecycleStrip.tsx
src/components/ocean/ClientAgreementsPanel.tsx
src/components/ocean/PaymentLinkField.tsx
src/pages/SettingsAutomations.tsx
```

Files to edit:
```
src/pages/AdvocateClientDetail.tsx   mount lifecycle + agreements panels
src/pages/Payments.tsx               add link field + gate
src/pages/Settings.tsx               link to automations page
src/components/ocean/NewAppointmentDialog.tsx  free discovery call preset
src/pages/ClientOnboarding.tsx       agreements step
src/components/ocean/DashboardCountCards.tsx   counters from new RPC
src/App.tsx                          route for /settings/automations
```

Security: all new tables RLS-on, GRANTed to authenticated + service_role; advocates use `has_role(auth.uid(),'advocate')`, clients can read their own rows only. Webhook function uses service role internally; never echoes data. Emails sent by actions reuse existing `enqueue_email` with "log in to view" copy only.

## What is NOT in this change

- External e-signature provider
- Auto-charging via Stripe/Square (link is copy-paste only)
- Full rule editor UI (rules are seeded; toggle only)
- Any change to existing health-data visibility rules
