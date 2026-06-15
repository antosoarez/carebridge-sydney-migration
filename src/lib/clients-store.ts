import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ClientCase,
  ClientColourKey,
  ClientPaymentStatus,
  ClientReportStatus,
  ClientTier,
  avatarColorFromId,
} from "@/lib/types";

export function useClients(): { clients: ClientCase[]; loading: boolean; reload: () => void } {
  const [clients, setClients] = useState<ClientCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) {
        if (!cancelled) { setClients([]); setLoading(false); }
        return;
      }
      const [{ data: profiles }, { data: metas }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, created_at, must_change_password, activated_at, tier, report_status, client_colour, payment_status, client_progress, lifecycle_status")
          .in("id", ids),
        supabase
          .from("client_report_meta")
          .select("client_id, report_progress, report_requested_from, report_requested_to")
          .in("client_id", ids),
      ]);
      if (cancelled) return;
      const metaById = new Map<string, any>((metas ?? []).map((m: any) => [m.client_id, m]));
      const list: ClientCase[] = (profiles ?? []).map((p: any) => {
        const must = !!p.must_change_password;
        const activated = p.activated_at as string | null;
        const m = metaById.get(p.id) ?? {};
        const status: ClientCase["status"] = must
          ? "needs_password_change"
          : !activated
          ? "invited"
          : "active";
        return {
          id: p.id,
          name: (p.full_name?.trim() || p.email || "Unnamed client") as string,
          email: p.email ?? "",
          avatarColor: avatarColorFromId(p.id),
          condition: "",
          clinic: "",
          acceptsAdvocacy: true,
          paymentStatus: "unpaid",
          invoiceStatus: "not_sent",
          amount: 0,
          amountPaid: 0,
          progress: 0,
          internalNotes: "",
          startedAt: p.created_at,
          mustChangePassword: must,
          activatedAt: activated,
          status,
          tier: (p.tier ?? "tier_1") as ClientTier,
          reportStatus: (p.report_status ?? "not_started") as ClientReportStatus,
          clientColour: (p.client_colour ?? "ocean") as ClientColourKey,
          paymentState: (p.payment_status ?? "unpaid") as ClientPaymentStatus,
          reportProgress: Math.max(0, Math.min(100, Number(m.report_progress ?? 0))),
          reportRequestedFrom: (m.report_requested_from as string | null) ?? null,
          reportRequestedTo: (m.report_requested_to as string | null) ?? null,
          clientProgress: Math.max(0, Math.min(100, Number(p.client_progress ?? 0))),
          lifecycleStatus: (p.lifecycle_status ?? null) as ClientCase["lifecycleStatus"],
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setClients(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  return { clients, loading, reload: () => setNonce((n) => n + 1) };
}
