import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Untyped client cast — new columns/RPCs are not yet in generated types.
const sb = supabase as unknown as { from: (t: string) => any; rpc: (n: string, a?: any) => any };

export type PaymentArrangement =
  | "upfront_100"
  | "tier_50_50"
  | "custom"
  | "external"
  | "waived";

export const PAYMENT_ARRANGEMENT_LABEL: Record<PaymentArrangement, string> = {
  upfront_100: "100% upfront",
  tier_50_50: "50% deposit / 50% final",
  custom: "Custom arrangement",
  external: "External arrangement",
  waived: "Fee waived / pro bono",
};

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "external_invoice", label: "External invoice" },
  { value: "other", label: "Other" },
] as const;

export interface ServiceTier {
  id: string;
  name: string;
  slug: string;
  price_aud: number;
  description: string | null;
  stripe_payment_link: string | null;
  delivery_days: number;
  sort_order: number;
}

export interface ServicePaymentRow {
  client_id: string;
  service_tier_id: string | null;
  service_selected_at: string | null;
  payment_arrangement: PaymentArrangement | null;
  total_amount: number;
  notes: string;
  payment_request_issued_at: string | null;
  agreements_completed_method: "in_app" | "external" | null;
  agreements_completed_notes: string | null;
  gating_override_reason: string | null;
  gating_override_at: string | null;
  external_payment_link_url: string | null;
}

export function useServiceTiers() {
  const [tiers, setTiers] = useState<ServiceTier[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from("service_tiers")
        .select("id, name, slug, price_aud, description, stripe_payment_link, delivery_days, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setTiers((data ?? []).map((t: any) => ({ ...t, price_aud: Number(t.price_aud ?? 0) })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);
  return { tiers, loading };
}

export interface ClientServicePaymentState {
  arrangement: ServicePaymentRow | null;
  paidTotal: number;
  lastPaidMethod: string | null;
  lastPaidAt: string | null;
  gatingOverride: boolean;
  paymentCompletedAt: string | null;
  loading: boolean;
  reload: () => void;
}

export function useClientServicePayment(clientId: string | undefined): ClientServicePaymentState {
  const [state, setState] = useState<Omit<ClientServicePaymentState, "reload">>({
    arrangement: null,
    paidTotal: 0,
    lastPaidMethod: null,
    lastPaidAt: null,
    gatingOverride: false,
    paymentCompletedAt: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const [arrRes, paysRes, profileRes] = await Promise.all([
        sb.from("client_fee_arrangements")
          .select("client_id, service_tier_id, service_selected_at, payment_arrangement, total_amount, notes, payment_request_issued_at, agreements_completed_method, agreements_completed_notes, gating_override_reason, gating_override_at, external_payment_link_url")
          .eq("client_id", clientId).maybeSingle(),
        sb.from("client_payments")
          .select("amount, paid, paid_at, payment_method")
          .eq("client_id", clientId),
        sb.from("profiles")
          .select("gating_override, payment_completed_at")
          .eq("id", clientId).maybeSingle(),
      ]);
      if (cancelled) return;
      const pays = (paysRes.data ?? []) as any[];
      const paid = pays.filter((p) => p.paid);
      paid.sort((a, b) => new Date(b.paid_at || 0).getTime() - new Date(a.paid_at || 0).getTime());
      const arr = arrRes.data as any | null;
      setState({
        arrangement: arr
          ? {
              client_id: arr.client_id,
              service_tier_id: arr.service_tier_id ?? null,
              service_selected_at: arr.service_selected_at ?? null,
              payment_arrangement: (arr.payment_arrangement ?? null) as PaymentArrangement | null,
              total_amount: Number(arr.total_amount ?? 0),
              notes: arr.notes ?? "",
              payment_request_issued_at: arr.payment_request_issued_at ?? null,
              agreements_completed_method: arr.agreements_completed_method ?? null,
              agreements_completed_notes: arr.agreements_completed_notes ?? null,
              gating_override_reason: arr.gating_override_reason ?? null,
              gating_override_at: arr.gating_override_at ?? null,
              external_payment_link_url: arr.external_payment_link_url ?? null,
            }
          : null,
        paidTotal: paid.reduce((s, p) => s + Number(p.amount ?? 0), 0),
        lastPaidMethod: paid[0]?.payment_method ?? null,
        lastPaidAt: paid[0]?.paid_at ?? null,
        gatingOverride: !!profileRes.data?.gating_override,
        paymentCompletedAt: profileRes.data?.payment_completed_at ?? null,
        loading: false,
      });
    })();
    return () => { cancelled = true; };
  }, [clientId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

export async function selectClientService(args: {
  clientId: string;
  tierId: string | null;
  tierSlug: string | null;
  total: number;
  arrangement: PaymentArrangement;
  notes: string;
}) {
  const { error } = await sb.rpc("select_client_service", {
    _client_id: args.clientId,
    _tier_id: args.tierId,
    _tier_slug: args.tierSlug,
    _total: args.total,
    _arrangement: args.arrangement,
    _notes: args.notes,
  });
  return error?.message ?? null;
}

export async function issuePaymentRequest(clientId: string) {
  const { error } = await sb.rpc("issue_payment_request", { _client_id: clientId });
  return error?.message ?? null;
}

export async function markAgreementsCompletedExternally(clientId: string, notes: string) {
  const { error } = await sb.rpc("mark_agreements_completed_externally", {
    _client_id: clientId, _notes: notes,
  });
  return error?.message ?? null;
}

export async function setGatingOverride(clientId: string, enabled: boolean, reason: string) {
  const { error } = await sb.rpc("set_gating_override", {
    _client_id: clientId, _enabled: enabled, _reason: reason,
  });
  return error?.message ?? null;
}

export function useCanBeginWork(clientId: string | undefined) {
  const [canBegin, setCanBegin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb.rpc("can_begin_client_work", { _client_id: clientId });
      if (!cancelled) setCanBegin(!!data);
    })();
    return () => { cancelled = true; };
  }, [clientId]);
  return canBegin;
}

export function paymentStatus(
  totalAmount: number,
  paidTotal: number,
  arrangement: PaymentArrangement | null,
): { key: "unpaid" | "half_paid" | "full_paid" | "waived"; label: string } {
  // NOTE: "external" is an arrangement (paid outside Stripe), NOT a payment status.
  // It must NOT automatically mean paid — the advocate still has to record the
  // payment manually (or enable the work-gate override) for the client to be
  // considered paid and for work to unlock.
  if (arrangement === "waived") return { key: "waived", label: "Waived / pro bono" };
  if (totalAmount > 0 && paidTotal >= totalAmount) return { key: "full_paid", label: "Fully paid" };
  if (paidTotal > 0) return { key: "half_paid", label: "Partially paid" };
  return { key: "unpaid", label: "Unpaid" };
}
