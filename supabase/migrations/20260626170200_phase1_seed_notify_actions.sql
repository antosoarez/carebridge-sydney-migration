-- =====================================================================
-- Phase 1: seed initial notify actions on existing rules
-- ---------------------------------------------------------------------
-- Wires the notification bridge to the lifecycle. Templates are rendered by
-- the dispatch-automation-outbox edge function (no PHI in any channel).
-- Idempotent via the unique (rule_id, sort_order) index.
-- =====================================================================

DO $$
DECLARE rid uuid;
BEGIN
  -- New enquiry -> tell the advocate
  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_enquiry';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'notify', jsonb_build_object(
      'to','advocate','template','advocate_new_enquiry','channels', jsonb_build_array('email','inapp')), 3)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  -- Agreements complete -> tell the client payment is next
  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_agreements_done';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'notify', jsonb_build_object(
      'to','client','template','client_agreements_ready','channels', jsonb_build_array('email','inapp')), 4)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;

  -- Payment received -> confirm to client + notify advocate
  SELECT id INTO rid FROM public.automation_rules WHERE slug='on_payment_received';
  INSERT INTO public.automation_rule_actions(rule_id, action_kind, action_config, sort_order) VALUES
    (rid, 'notify', jsonb_build_object(
      'to','client','template','client_payment_confirmed','channels', jsonb_build_array('email','inapp')), 4),
    (rid, 'notify', jsonb_build_object(
      'to','advocate','template','advocate_payment_received','channels', jsonb_build_array('email','inapp')), 5)
  ON CONFLICT (rule_id, sort_order) DO NOTHING;
END $$;
