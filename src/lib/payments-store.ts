import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeeModel = "tier_50_50" | "custom";
export type PaymentKind = "deposit" | "final" | "custom";

export interface FeeArrangement {
  client_id: string;
  total_amount: number;
  model: FeeModel;
  notes: string;
}

export interface ClientPayment {
  id: string;
  client_id: string;
  kind: PaymentKind;
  label: string;
  amount: number;
  invoice_given: boolean;
  invoice_given_at: string | null;
  paid: boolean;
  paid_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface PaymentSettings {
  bank_details: string;
  currency: string;
}

export function formatCurrency(amount: number, currency = "AUD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  } catch {
    return `$${(amount || 0).toFixed(0)}`;
  }
}

export function isOverdueSevenDays(invoice_given_at: string | null): boolean {
  if (!invoice_given_at) return false;
  const ms = Date.now() - new Date(invoice_given_at).getTime();
  return ms >= 7 * 24 * 60 * 60 * 1000;
}

export function statusLabel(
  arrangement: FeeArrangement | null,
  payments: ClientPayment[],
): { label: string; tone: "neutral" | "partial" | "complete" | "pending" } {
  if (!arrangement || arrangement.total_amount === 0) {
    return { label: "No arrangement yet", tone: "neutral" };
  }
  if (arrangement.model === "custom") {
    const totalPaid = payments.filter((p) => p.paid).reduce((s, p) => s + Number(p.amount), 0);
    if (totalPaid === 0) return { label: "Custom — nothing paid yet", tone: "pending" };
    if (totalPaid >= Number(arrangement.total_amount)) return { label: "Custom — paid in full", tone: "complete" };
    return { label: `Custom — ${formatCurrency(totalPaid)} received`, tone: "partial" };
  }
  const dep = payments.find((p) => p.kind === "deposit");
  const fin = payments.find((p) => p.kind === "final");
  if (dep?.paid && fin?.paid) return { label: "Paid in full", tone: "complete" };
  if (dep?.paid && !fin?.paid) return { label: "Deposit paid — final pending", tone: "partial" };
  if (!dep?.paid && fin?.paid) return { label: "Final paid — deposit pending", tone: "partial" };
  return { label: "Nothing paid yet", tone: "pending" };
}

export function usePaymentSettings() {
  const [settings, setSettings] = useState<PaymentSettings>({ bank_details: "", currency: "AUD" });
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("payment_settings")
        .select("bank_details, currency, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled) return;
      setSettings({
        bank_details: data?.bank_details ?? "",
        currency: data?.currency ?? "AUD",
      });
      setUpdatedAt(data?.updated_at ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  const save = useCallback(async (patch: Partial<PaymentSettings>) => {
    const { error } = await supabase
      .from("payment_settings")
      .update(patch)
      .eq("id", 1);
    if (!error) setNonce((n) => n + 1);
    return error;
  }, []);

  return { settings, updatedAt, loading, save, reload: () => setNonce((n) => n + 1) };
}

export function useClientPaymentTracker(clientId: string | undefined) {
  const [arrangement, setArrangement] = useState<FeeArrangement | null>(null);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: fa }, { data: pays }] = await Promise.all([
        supabase
          .from("client_fee_arrangements")
          .select("client_id, total_amount, model, notes")
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase
          .from("client_payments")
          .select("*")
          .eq("client_id", clientId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setArrangement(
        fa
          ? {
              client_id: fa.client_id,
              total_amount: Number(fa.total_amount ?? 0),
              model: fa.model as FeeModel,
              notes: fa.notes ?? "",
            }
          : null,
      );
      setPayments(
        (pays ?? []).map((p: any) => ({
          ...p,
          amount: Number(p.amount ?? 0),
        })),
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { arrangement, payments, loading, reload };
}

/**
 * Ensure deposit & final rows exist for a tier_50_50 arrangement. Amounts
 * are split evenly from the total.
 */
export async function ensureTierMilestones(clientId: string, total: number) {
  const half = Math.round((total / 2) * 100) / 100;
  const { data: existing } = await supabase
    .from("client_payments")
    .select("id, kind, amount, paid")
    .eq("client_id", clientId)
    .in("kind", ["deposit", "final"]);

  const map = new Map<string, any>((existing ?? []).map((p: any) => [p.kind, p]));

  if (!map.has("deposit")) {
    await supabase.from("client_payments").insert({
      client_id: clientId,
      kind: "deposit",
      label: "Deposit (50% upfront)",
      amount: half,
      sort_order: 0,
    });
  } else if (!map.get("deposit").paid) {
    // refresh amount if not yet paid, so total changes flow through
    await supabase
      .from("client_payments")
      .update({ amount: half })
      .eq("id", map.get("deposit").id);
  }

  if (!map.has("final")) {
    await supabase.from("client_payments").insert({
      client_id: clientId,
      kind: "final",
      label: "Final (50% on completion)",
      amount: half,
      sort_order: 1,
    });
  } else if (!map.get("final").paid) {
    await supabase
      .from("client_payments")
      .update({ amount: half })
      .eq("id", map.get("final").id);
  }
}
