
-- payment_settings: single row, advocate-only writes
CREATE TABLE public.payment_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  bank_details text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'AUD',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT payment_settings_single_row CHECK (id = 1)
);
INSERT INTO public.payment_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
  ON public.payment_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Advocates manage settings"
  ON public.payment_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- client_fee_arrangements
CREATE TYPE public.fee_model AS ENUM ('tier_50_50', 'custom');

CREATE TABLE public.client_fee_arrangements (
  client_id uuid PRIMARY KEY,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  model public.fee_model NOT NULL DEFAULT 'tier_50_50',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.client_fee_arrangements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Advocates manage fee arrangements"
  ON public.client_fee_arrangements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));

-- client_payments
CREATE TYPE public.payment_kind AS ENUM ('deposit', 'final', 'custom');

CREATE TABLE public.client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  kind public.payment_kind NOT NULL DEFAULT 'custom',
  label text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  invoice_given boolean NOT NULL DEFAULT false,
  invoice_given_at timestamptz,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX client_payments_client_id_idx ON public.client_payments(client_id);
CREATE UNIQUE INDEX client_payments_unique_deposit
  ON public.client_payments(client_id) WHERE kind = 'deposit';
CREATE UNIQUE INDEX client_payments_unique_final
  ON public.client_payments(client_id) WHERE kind = 'final';

ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Advocates manage all payments"
  ON public.client_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'))
  WITH CHECK (public.has_role(auth.uid(), 'advocate'));
CREATE POLICY "Clients see own outstanding payments"
  ON public.client_payments FOR SELECT TO authenticated
  USING (auth.uid() = client_id AND invoice_given = true AND paid = false);

-- payment_reminders_log
CREATE TABLE public.payment_reminders_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.client_payments(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_reminders_log_payment_idx ON public.payment_reminders_log(payment_id);
ALTER TABLE public.payment_reminders_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Advocates view reminders log"
  ON public.payment_reminders_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- payment_note_dismissals
CREATE TABLE public.payment_note_dismissals (
  client_id uuid NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.client_payments(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, payment_id)
);
ALTER TABLE public.payment_note_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients manage own dismissals"
  ON public.payment_note_dismissals FOR ALL TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Advocates view dismissals"
  ON public.payment_note_dismissals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advocate'));

-- touch triggers
CREATE OR REPLACE FUNCTION public.touch_payment_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  -- auto-stamp dates
  IF TG_TABLE_NAME = 'client_payments' THEN
    IF NEW.invoice_given AND NEW.invoice_given_at IS NULL THEN
      NEW.invoice_given_at := now();
    END IF;
    IF NOT NEW.invoice_given THEN
      NEW.invoice_given_at := NULL;
    END IF;
    IF NEW.paid AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
    IF NOT NEW.paid THEN
      NEW.paid_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_payment_settings BEFORE UPDATE ON public.payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_payment_row();
CREATE TRIGGER touch_fee_arrangements BEFORE INSERT OR UPDATE ON public.client_fee_arrangements
  FOR EACH ROW EXECUTE FUNCTION public.touch_payment_row();
CREATE TRIGGER touch_client_payments BEFORE INSERT OR UPDATE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_payment_row();

-- Extend admin_delete_client to clean up payment rows
CREATE OR REPLACE FUNCTION public.admin_delete_client(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'advocate') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT public.has_role(_user_id, 'client') THEN
    RAISE EXCEPTION 'Target is not a client';
  END IF;

  DELETE FROM public.payment_note_dismissals WHERE client_id = _user_id;
  DELETE FROM public.payment_reminders_log   WHERE client_id = _user_id;
  DELETE FROM public.client_payments         WHERE client_id = _user_id;
  DELETE FROM public.client_fee_arrangements WHERE client_id = _user_id;
  DELETE FROM public.tasks            WHERE client_id = _user_id;
  DELETE FROM public.appointments     WHERE client_id = _user_id;
  DELETE FROM public.documents        WHERE client_id = _user_id OR uploaded_by = _user_id;
  DELETE FROM public.emotion_logs     WHERE user_id   = _user_id;
  DELETE FROM public.mfa_recovery_codes WHERE user_id = _user_id;
  DELETE FROM public.trusted_devices  WHERE user_id   = _user_id;
  DELETE FROM public.user_roles       WHERE user_id   = _user_id;
  DELETE FROM public.profiles         WHERE id        = _user_id;
END;
$function$;
