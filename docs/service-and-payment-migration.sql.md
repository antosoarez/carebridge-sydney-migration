# Service & Payment migration

Run with: `supabase db push --db-url "$SUPABASE_DB_URL"` after dropping the
SQL below into `supabase/migrations/20260629120000_service_and_payment.sql`.
Idempotent — safe to re-run.

```sql
-- =====================================================================
-- Service & Payment section
-- ---------------------------------------------------------------------
-- Adds advocate-only fields + RPCs for explicit service selection,
-- payment-request issuing, manual agreement completion, and a
-- work-gate override. Reuses: service_tiers, client_fee_arrangements,
-- client_payments, profiles, client_cases.
-- =====================================================================

-- 1) New columns on client_fee_arrangements --------------------------------
ALTER TABLE public.client_fee_arrangements
  ADD COLUMN IF NOT EXISTS service_tier_id uuid REFERENCES public.service_tiers(id),
  ADD COLUMN IF NOT EXISTS service_selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_selected_by uuid,
  ADD COLUMN IF NOT EXISTS payment_arrangement text
    CHECK (payment_arrangement IN ('upfront_100','tier_50_50','custom','external','waived')),
  ADD COLUMN IF NOT EXISTS payment_request_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_request_issued_by uuid,
  ADD COLUMN IF NOT EXISTS agreements_completed_method text
    CHECK (agreements_completed_method IN ('in_app','external')),
  ADD COLUMN IF NOT EXISTS agreements_completed_notes text,
  ADD COLUMN IF NOT EXISTS agreements_completed_by uuid,
  ADD COLUMN IF NOT EXISTS gating_override_reason text,
  ADD COLUMN IF NOT EXISTS gating_override_by uuid,
  ADD COLUMN IF NOT EXISTS gating_override_at timestamptz;

-- 2) select_client_service ------------------------------------------------
CREATE OR REPLACE FUNCTION public.select_client_service(
  _client_id uuid,
  _tier_id uuid,
  _tier_slug text,
  _total numeric,
  _arrangement text,
  _notes text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fee_model public.fee_model;
  v_half numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Only advocates can select a service';
  END IF;
  IF _arrangement NOT IN ('upfront_100','tier_50_50','custom','external','waived') THEN
    RAISE EXCEPTION 'Invalid payment arrangement: %', _arrangement;
  END IF;
  v_fee_model := CASE WHEN _arrangement = 'tier_50_50' THEN 'tier_50_50'::public.fee_model
                      ELSE 'custom'::public.fee_model END;

  INSERT INTO public.client_fee_arrangements (
    client_id, total_amount, model, notes,
    service_tier_id, service_selected_at, service_selected_by,
    payment_arrangement, updated_by
  ) VALUES (
    _client_id, COALESCE(_total, 0), v_fee_model, COALESCE(_notes, ''),
    _tier_id, now(), auth.uid(),
    _arrangement, auth.uid()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    total_amount = COALESCE(_total, 0),
    model = v_fee_model,
    notes = COALESCE(_notes, public.client_fee_arrangements.notes),
    service_tier_id = _tier_id,
    service_selected_at = COALESCE(public.client_fee_arrangements.service_selected_at, now()),
    service_selected_by = COALESCE(public.client_fee_arrangements.service_selected_by, auth.uid()),
    payment_arrangement = _arrangement,
    updated_by = auth.uid(),
    updated_at = now();

  IF _tier_slug IS NOT NULL THEN
    UPDATE public.profiles SET tier = _tier_slug WHERE id = _client_id;
  END IF;

  UPDATE public.client_cases
     SET tier = COALESCE(_tier_slug, tier),
         payment_state = CASE
           WHEN _arrangement = 'waived' THEN 'Waived'
           WHEN _arrangement = 'external' THEN 'N/A'
           ELSE COALESCE(payment_state, 'Unpaid') END,
         updated_at = now()
   WHERE id = (
     SELECT id FROM public.client_cases
      WHERE client_id = _client_id
        AND case_status NOT IN ('Completed','Closed')
      ORDER BY opened_at DESC LIMIT 1
   );

  IF _arrangement = 'tier_50_50' AND COALESCE(_total, 0) > 0 THEN
    v_half := round((_total / 2.0)::numeric, 2);
    IF NOT EXISTS (SELECT 1 FROM public.client_payments
                    WHERE client_id = _client_id AND kind = 'deposit') THEN
      INSERT INTO public.client_payments(client_id, kind, label, amount, currency, sort_order)
      VALUES (_client_id, 'deposit', 'Deposit (50% upfront)', v_half, 'AUD', 0);
    ELSE
      UPDATE public.client_payments SET amount = v_half
       WHERE client_id = _client_id AND kind = 'deposit' AND paid = false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.client_payments
                    WHERE client_id = _client_id AND kind = 'final') THEN
      INSERT INTO public.client_payments(client_id, kind, label, amount, currency, sort_order)
      VALUES (_client_id, 'final', 'Final (50% on completion)', v_half, 'AUD', 1);
    ELSE
      UPDATE public.client_payments SET amount = v_half
       WHERE client_id = _client_id AND kind = 'final' AND paid = false;
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.select_client_service(uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_client_service(uuid, uuid, text, numeric, text, text) TO authenticated, service_role;

-- 3) mark_agreements_completed_externally ---------------------------------
CREATE OR REPLACE FUNCTION public.mark_agreements_completed_externally(
  _client_id uuid, _notes text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Only advocates can mark agreements externally';
  END IF;
  IF _notes IS NULL OR length(btrim(_notes)) = 0 THEN
    RAISE EXCEPTION 'Notes are required when recording external agreement completion';
  END IF;
  INSERT INTO public.client_fee_arrangements (client_id) VALUES (_client_id)
    ON CONFLICT (client_id) DO NOTHING;
  UPDATE public.client_fee_arrangements
     SET agreements_completed_method = 'external',
         agreements_completed_notes = _notes,
         agreements_completed_by = auth.uid(),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE client_id = _client_id;
  UPDATE public.profiles
     SET agreements_completed_at = COALESCE(agreements_completed_at, now())
   WHERE id = _client_id;
  PERFORM public.run_automations(_client_id, 'agreements_completed');
END $$;
REVOKE ALL ON FUNCTION public.mark_agreements_completed_externally(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_agreements_completed_externally(uuid, text) TO authenticated, service_role;

-- 4) issue_payment_request ------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_payment_request(_client_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Only advocates can send a payment request';
  END IF;
  INSERT INTO public.client_fee_arrangements (client_id) VALUES (_client_id)
    ON CONFLICT (client_id) DO NOTHING;
  UPDATE public.client_fee_arrangements
     SET payment_request_issued_at = COALESCE(payment_request_issued_at, now()),
         payment_request_issued_by = COALESCE(payment_request_issued_by, auth.uid()),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE client_id = _client_id;
END $$;
REVOKE ALL ON FUNCTION public.issue_payment_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_payment_request(uuid) TO authenticated, service_role;

-- 5) set_gating_override --------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_gating_override(
  _client_id uuid, _enabled boolean, _reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Only advocates can change the work gate';
  END IF;
  IF _enabled AND (_reason IS NULL OR length(btrim(_reason)) = 0) THEN
    RAISE EXCEPTION 'A reason is required to allow work without full payment';
  END IF;
  PERFORM set_config('app.recomputing_progress', 'on', true);
  UPDATE public.profiles SET gating_override = _enabled WHERE id = _client_id;
  PERFORM set_config('app.recomputing_progress', 'off', true);
  INSERT INTO public.client_fee_arrangements (client_id) VALUES (_client_id)
    ON CONFLICT (client_id) DO NOTHING;
  UPDATE public.client_fee_arrangements
     SET gating_override_reason = CASE WHEN _enabled THEN _reason ELSE NULL END,
         gating_override_by = CASE WHEN _enabled THEN auth.uid() ELSE NULL END,
         gating_override_at = CASE WHEN _enabled THEN now() ELSE NULL END,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE client_id = _client_id;
END $$;
REVOKE ALL ON FUNCTION public.set_gating_override(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gating_override(uuid, boolean, text) TO authenticated, service_role;

-- 6) can_begin_client_work -------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_begin_client_work(_client_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_override boolean; v_total numeric; v_paid numeric; v_arrangement text;
BEGIN
  SELECT gating_override INTO v_override FROM public.profiles WHERE id = _client_id;
  IF COALESCE(v_override, false) THEN RETURN true; END IF;
  SELECT total_amount, payment_arrangement INTO v_total, v_arrangement
    FROM public.client_fee_arrangements WHERE client_id = _client_id;
  IF v_arrangement IS NULL THEN RETURN false; END IF;
  IF v_arrangement IN ('waived','external') THEN RETURN true; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.client_payments WHERE client_id = _client_id AND paid = true;
  RETURN v_total IS NOT NULL AND v_total > 0 AND v_paid >= v_total;
END $$;
REVOKE ALL ON FUNCTION public.can_begin_client_work(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_begin_client_work(uuid) TO authenticated, service_role;

-- 7) mark_paid_manually — partial vs full status --------------------------
CREATE OR REPLACE FUNCTION public.mark_paid_manually(
  _client_id uuid, _method text, _notes text, _amount numeric DEFAULT 0
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_total numeric; v_paid numeric; v_status public.client_payment_status;
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Only advocates can mark payments manually';
  END IF;
  INSERT INTO public.client_payments(
    client_id, kind, label, amount, currency, payment_method, notes,
    invoice_given, invoice_given_at, paid, updated_by
  ) VALUES (
    _client_id, 'custom', 'Manual payment ('||COALESCE(_method,'manual')||')',
    COALESCE(_amount, 0), 'AUD', COALESCE(_method,'manual_bank'), _notes,
    true, now(), false, auth.uid()
  ) RETURNING id INTO v_id;
  UPDATE public.client_payments SET paid = true, paid_at = now()
   WHERE id = v_id AND paid = false;

  SELECT COALESCE(total_amount, 0) INTO v_total
    FROM public.client_fee_arrangements WHERE client_id = _client_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.client_payments WHERE client_id = _client_id AND paid = true;

  IF v_total > 0 AND v_paid >= v_total THEN v_status := 'full_paid';
  ELSIF v_paid > 0 THEN v_status := 'half_paid';
  ELSE v_status := 'unpaid'; END IF;

  PERFORM set_config('app.recomputing_progress', 'on', true);
  UPDATE public.profiles SET payment_status = v_status WHERE id = _client_id;
  PERFORM set_config('app.recomputing_progress', 'off', true);

  IF v_status = 'full_paid' THEN
    PERFORM public.run_automations(_client_id, 'payment_received');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.mark_paid_manually(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_paid_manually(uuid, text, text, numeric) TO authenticated, service_role;
```
