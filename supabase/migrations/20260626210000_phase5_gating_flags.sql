-- =====================================================================
-- Phase 5: client-journey gating flags + manual payment override
-- ---------------------------------------------------------------------
-- Adds profile completion timestamps so ProtectedRoute can gate the journey
-- with a single cheap read, plus an advocate manual-payment path. Flags are
-- maintained by small dedicated triggers on the source tables (kept separate
-- from the automation triggers to avoid re-authoring them). These columns are
-- NOT in guard_profile_advocate_fields, so triggers can set them directly.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agreements_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS consultation_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS gating_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS notes text;

-- ---------- flag-maintaining triggers ----------
CREATE OR REPLACE FUNCTION public.trg_flag_agreements_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.client_has_all_required_agreements(NEW.client_id) THEN
    UPDATE public.profiles SET agreements_completed_at = COALESCE(agreements_completed_at, now())
      WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_flag_agreements_done ON public.client_agreement_acceptances;
CREATE TRIGGER trg_flag_agreements_done
AFTER INSERT ON public.client_agreement_acceptances
FOR EACH ROW EXECUTE FUNCTION public.trg_flag_agreements_done();

CREATE OR REPLACE FUNCTION public.trg_flag_payment_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.paid = true AND COALESCE(OLD.paid, false) = false THEN
    UPDATE public.profiles SET payment_completed_at = COALESCE(payment_completed_at, now())
      WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_flag_payment_done ON public.client_payments;
CREATE TRIGGER trg_flag_payment_done
AFTER UPDATE ON public.client_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_flag_payment_done();

CREATE OR REPLACE FUNCTION public.trg_flag_consultation_booked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.category = 'consultation' AND NEW.client_id IS NOT NULL THEN
    UPDATE public.profiles SET consultation_booked_at = COALESCE(consultation_booked_at, now())
      WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_flag_consultation_booked ON public.appointments;
CREATE TRIGGER trg_flag_consultation_booked
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.trg_flag_consultation_booked();

CREATE OR REPLACE FUNCTION public.trg_flag_intake_done()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.submitted_at IS NOT NULL AND NEW.client_id IS NOT NULL THEN
    UPDATE public.profiles SET intake_completed_at = COALESCE(intake_completed_at, now())
      WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_flag_intake_done ON public.client_intake;
CREATE TRIGGER trg_flag_intake_done
AFTER INSERT OR UPDATE ON public.client_intake
FOR EACH ROW EXECUTE FUNCTION public.trg_flag_intake_done();

-- ---------- manual payment override (advocate) ----------
CREATE OR REPLACE FUNCTION public.mark_paid_manually(
  _client_id uuid, _method text, _notes text, _amount numeric DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
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
  -- flip to paid so trg_payment_received + trg_flag_payment_done fire
  UPDATE public.client_payments SET paid = true, paid_at = now() WHERE id = v_id AND paid = false;
END $$;
REVOKE ALL ON FUNCTION public.mark_paid_manually(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_paid_manually(uuid, text, text, numeric) TO authenticated, service_role;

-- ---------- backfill (real signals) ----------
UPDATE public.profiles p SET agreements_completed_at = now()
  WHERE agreements_completed_at IS NULL AND public.client_has_all_required_agreements(p.id)
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'client')
    AND EXISTS (SELECT 1 FROM public.client_agreement_acceptances a WHERE a.client_id = p.id);
UPDATE public.profiles p SET payment_completed_at = now()
  WHERE payment_completed_at IS NULL AND EXISTS (SELECT 1 FROM public.client_payments cp WHERE cp.client_id = p.id AND cp.paid);
UPDATE public.profiles p SET consultation_booked_at = now()
  WHERE consultation_booked_at IS NULL AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.client_id = p.id AND a.category = 'consultation');
UPDATE public.profiles p SET intake_completed_at = now()
  WHERE intake_completed_at IS NULL AND EXISTS (SELECT 1 FROM public.client_intake ci WHERE ci.client_id = p.id AND ci.submitted_at IS NOT NULL);

-- ---------- grandfather existing Active+ clients (don't push them backward) ----------
UPDATE public.profiles SET
  agreements_completed_at = COALESCE(agreements_completed_at, now()),
  payment_completed_at    = COALESCE(payment_completed_at, now()),
  consultation_booked_at  = COALESCE(consultation_booked_at, now()),
  intake_completed_at     = COALESCE(intake_completed_at, now())
WHERE lifecycle_status IN (
  'Active','Work in progress','Report delivered','Ongoing support','Completed',
  'Follow-up required','Appointment upcoming','Report in progress','Payment outstanding',
  'Waiting on client','Waiting on clinic'
);
