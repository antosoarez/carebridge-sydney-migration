## Goal
Add an advocate-only "Service & Payment" section to each client profile, gate the client portal accordingly, and restore a full advocate Payments page. Reuse existing tables (`service_tiers`, `client_fee_arrangements`, `client_payments`, `profiles`, `client_cases`) and existing RPCs (`mark_paid_manually`, `run_automations`). No new payment system; no duplicate tables.

## Scope

### 1. Database (one new migration `…_service_and_payment.sql`)
- **Extend `fee_model` enum** with: `upfront_100`, `external`, `waived` (keep existing `tier_50_50`, `custom`).
- **Extend `client_fee_arrangements`**:
  - `service_tier_id uuid references service_tiers(id)`
  - `service_selected_at timestamptz`, `service_selected_by uuid`
  - `payment_request_issued_at timestamptz`, `payment_request_issued_by uuid`
  - `agreements_completed_method text` (`in_app` | `external`)
  - `agreements_completed_notes text`, `agreements_completed_by uuid`
  - `gating_override_reason text`, `gating_override_by uuid`, `gating_override_at timestamptz`
- **New RPCs (SECURITY DEFINER, advocate-only)**:
  - `select_client_service(_client_id, _tier_id, _total numeric, _model fee_model, _notes)` — writes fee arrangement, sets `profiles.tier`, updates the active `client_cases` row (`service_tier_id`, `payment_state='pending'`), and creates milestone rows when `tier_50_50` (reuses `ensureTierMilestones` logic).
  - `mark_agreements_completed_externally(_client_id, _notes)` — sets `profiles.agreements_completed_at`, records method/notes/by on the arrangement, then `run_automations(_client_id, 'agreements_completed')`.
  - `issue_payment_request(_client_id)` — sets `payment_request_issued_at/by`.
  - `set_gating_override(_client_id, _enabled bool, _reason text)` — writes `profiles.gating_override` + audit columns on arrangement.
  - `can_begin_client_work(_client_id) returns boolean` — true if `payment_completed_at` is set **and** total paid ≥ agreed total, OR `gating_override = true`. Onboarding/invite acceptance do NOT contribute.
- **Update `mark_paid_manually`**: after flipping `paid`, compute `sum(paid amount) vs total_amount` → if ≥ total set `profiles.payment_status='full_paid'` and call `run_automations(_client_id,'payment_received')`; if 0 < sum < total set `half_paid` and DO NOT trigger payment automation. (Trigger already sets `payment_completed_at`; gate via the sum check above.)
- RLS: advocate-only on all new RPCs; the new columns inherit table RLS (already advocate-managed).

### 2. Advocate UI — new `ServicePaymentSection` component, mounted in `AdvocateClientDetail.tsx`
A single calm card with sub-blocks (replaces today's scattered `PaymentLinkField` + `ClientPaymentTracker` + `ManualPaymentOverride` + `ClientAgreementsPanel` placement; those components are reused inside it):
1. **Service** — Select sourced from `service_tiers` + "Custom service" option. Shows current tier (or "Not selected yet" if `service_selected_at` is null, even when `profiles.tier='tier_1'`). Save → `select_client_service` RPC.
2. **Agreed fee & model** — total input pre-filled from tier price; model radio group (5 options). Saves through the same RPC.
3. **Agreements** — embed existing `AgreementStatusList`; add "Mark agreements completed externally" button → confirm dialog with required notes → `mark_agreements_completed_externally` RPC.
4. **Payment request** — summary (service, total, paid, remaining); "Send payment request" button → `issue_payment_request` RPC; shows Stripe link from `service_tiers.stripe_payment_link` or `client_fee_arrangements.external_payment_link_url` (copy + open).
5. **Manual payment** — reuse `ManualPaymentOverride`, extended with date field; method dropdown (`bank_transfer | cash | external_invoice | other`).
6. **Work gate** — badge (Locked / Partially paid / Unlocked) driven by `can_begin_client_work` + paid-vs-total. Includes "Allow work to begin without full payment" toggle with reason textarea (required) → `set_gating_override`.

All of this is wrapped in `has_role('advocate')` check; nothing renders for clients.

### 3. Client UI — slim `ClientServicePaymentCard` on `ClientDashboard.tsx` / replace contents of `ClientPayment.tsx`
Shows only: selected service name, agreed price, payment model label, amount due, amount paid, status badge. Payment button (Stripe link or external link) renders **only when** `payment_request_issued_at` is set. No advocate controls, no internal notes. Update `ProtectedRoute`/work-gated client routes to call `can_begin_client_work` (via a small `useCanBeginWork(clientId)` hook) so onboarding/invite acceptance do not unlock paid work.

### 4. Advocate Payments page (`/advocate/payments`)
Restore visibility in `AppShell` nav (already wired — verify) and rebuild `src/pages/Payments.tsx` as a list/table:
- Columns: client, selected tier, agreed total, paid, remaining, status (`unpaid | half_paid | full_paid | overdue`), payment method (last payment), last action date.
- Filter chips: Unpaid · Partially paid · Fully paid · Overdue.
- Search box (name/email).
- Row click → opens the client's Service & Payment section.
Keeps existing "Bank transfer details" panel and summary cards.

## Technical details
- Files added: `supabase/migrations/20260629xxxxxx_service_and_payment.sql`, `src/components/ocean/ServicePaymentSection.tsx`, `src/components/ocean/ClientServicePaymentCard.tsx`, `src/lib/service-payment-store.ts` (hooks: `useServiceTiers`, `useClientServicePayment`, `useCanBeginWork`).
- Files edited: `src/pages/AdvocateClientDetail.tsx` (mount section, remove now-redundant duplicates), `src/pages/ClientPayment.tsx` + `src/pages/ClientDashboard.tsx` (slim view), `src/pages/Payments.tsx` (rebuilt list), `src/components/ProtectedRoute.tsx` (work gate via `can_begin_client_work`), `src/components/ocean/ManualPaymentOverride.tsx` (date + method enum), `src/lib/payments-store.ts` (extend `FeeModel` type, status mapping).
- Reuses: `service_tiers`, `client_fee_arrangements`, `client_payments`, `mark_paid_manually`, `run_automations`, `gating_override` column, `StripePaymentCta`, `AgreementStatusList`, `ClientPaymentTracker`.
- RLS: every new RPC checks `has_role(auth.uid(),'advocate')`; client-facing reads use existing arrangement select policy.
- Tier default: client view treats `service_selected_at IS NULL` as "no service yet" even when `profiles.tier='tier_1'`, so the default isn't shown as a real selection.

## Out of scope
- No changes to onboarding flow content, automation rule definitions, or Stripe webhook logic.
- No new tables; no second payment ledger.
- No deployment — migration goes into `supabase/migrations/` for `db push`.
