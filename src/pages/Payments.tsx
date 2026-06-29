import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { ClientAvatar } from "@/components/ocean/ClientAvatar";
import { ServicePaymentSection } from "@/components/ocean/ServicePaymentSection";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { useClients } from "@/lib/clients-store";
import {
  formatCurrency,
  isOverdueSevenDays,
  statusLabel,
  usePaymentSettings,
} from "@/lib/payments-store";
import { PAYMENT_ARRANGEMENT_LABEL, paymentStatus, useServiceTiers } from "@/lib/service-payment-store";
import { Receipt, Wallet, Landmark, Waves, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "unpaid" | "partial" | "full" | "overdue";

interface Summary {
  totalAgreed: number;
  totalPaid: number;
  totalOutstanding: number;
  clientsWithBalance: number;
  overdueCount: number;
}

export default function Payments() {
  const { clients, loading: clientsLoading } = useClients();
  const { settings, save: saveSettings, updatedAt } = usePaymentSettings();
  const [bankDetails, setBankDetails] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [savingSettings, setSavingSettings] = useState(false);
  const [arrangements, setArrangements] = useState<Record<string, any>>({});
  const [paymentsByClient, setPaymentsByClient] = useState<Record<string, any[]>>({});
  const [loadingTotals, setLoadingTotals] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const { tiers } = useServiceTiers();
  const tierById = useMemo(() => Object.fromEntries(tiers.map((t) => [t.id, t])), [tiers]);

  useEffect(() => { setBankDetails(settings.bank_details); setCurrency(settings.currency); }, [settings]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTotals(true);
      const [{ data: fas }, { data: pays }] = await Promise.all([
        supabase.from("client_fee_arrangements").select(
          "client_id, total_amount, model, notes, service_tier_id, payment_arrangement, payment_request_issued_at"
        ),
        supabase.from("client_payments").select("*"),
      ]);
      if (cancelled) return;
      const aMap: Record<string, any> = {};
      (fas ?? []).forEach((f: any) => { aMap[f.client_id] = { ...f, total_amount: Number(f.total_amount) }; });
      const pMap: Record<string, any[]> = {};
      (pays ?? []).forEach((p: any) => {
        const arr = pMap[p.client_id] ?? (pMap[p.client_id] = []);
        arr.push({ ...p, amount: Number(p.amount) });
      });
      setArrangements(aMap);
      setPaymentsByClient(pMap);
      setLoadingTotals(false);
    })();
  }, [clients, refreshKey]);

  const summary = useMemo<Summary>(() => {
    let totalAgreed = 0, totalPaid = 0, clientsWithBalance = 0, overdueCount = 0;
    for (const c of clients) {
      const fa = arrangements[c.id];
      const pays = paymentsByClient[c.id] ?? [];
      if (fa?.total_amount) totalAgreed += Number(fa.total_amount);
      const paid = pays.filter((p: any) => p.paid).reduce((s, p: any) => s + Number(p.amount), 0);
      totalPaid += paid;
      const expected = fa?.total_amount ?? pays.reduce((s, p: any) => s + Number(p.amount), 0);
      if (expected > paid + 0.01) clientsWithBalance += 1;
      overdueCount += pays.filter((p: any) => p.invoice_given && !p.paid && isOverdueSevenDays(p.invoice_given_at)).length;
    }
    return {
      totalAgreed,
      totalPaid,
      totalOutstanding: Math.max(0, totalAgreed - totalPaid),
      clientsWithBalance,
      overdueCount,
    };
  }, [clients, arrangements, paymentsByClient]);

  const saveBank = async () => {
    setSavingSettings(true);
    const err = await saveSettings({ bank_details: bankDetails, currency });
    setSavingSettings(false);
    if (err) toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    else toast({ title: "Saved", description: "Payment settings updated." });
  };

  const loading = clientsLoading || loadingTotals;

  return (
    <AppShell role="advocate" title="Payments" subtitle="A calm tracker for bank-transfer payments — no card processing here.">
      {/* Overview */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard icon={<Wallet className="h-5 w-5" />} label="Total paid" value={formatCurrency(summary.totalPaid, settings.currency)} tone="primary" />
        <SummaryCard icon={<Receipt className="h-5 w-5" />} label="Still outstanding" value={formatCurrency(summary.totalOutstanding, settings.currency)} tone="accent" />
        <SummaryCard icon={<Landmark className="h-5 w-5" />} label="Clients with a balance" value={String(summary.clientsWithBalance)} tone="neutral" />
        <SummaryCard icon={<Waves className="h-5 w-5" />} label="Gentle nudges" value={String(summary.overdueCount)} tone="soft" subtext="pending > 7 days" />
      </div>

      {/* Bank details */}
      <section className="glass-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Landmark className="h-4 w-4 text-primary" />
          <h2 className="font-display text-xl text-primary-deep">Bank transfer details</h2>
          <span className="text-xs text-muted-foreground">(shown to clients in payment notes & reminder emails)</span>
        </div>
        {updatedAt && (
          <p className="text-xs text-muted-foreground mb-4">Last updated {new Date(updatedAt).toLocaleDateString()}</p>
        )}
        <Textarea
          rows={4}
          value={bankDetails}
          onChange={(e) => setBankDetails(e.target.value)}
          placeholder={"Account name: CareBridge Perth\nBSB: 000-000\nAccount: 0000 0000\nReference: your full name"}
          className="rounded-2xl bg-secondary/40 border-0 resize-none"
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="currency">Currency</label>
            <Input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              className="mt-1 h-10 w-24 rounded-2xl bg-secondary/40 border-0"
            />
          </div>
          <Button onClick={saveBank} disabled={savingSettings} className="rounded-full h-10 ml-auto">
            {savingSettings ? "Saving…" : "Save details"}
          </Button>
        </div>
      </section>

      {/* Per-client list */}
      <section>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-display text-xl text-primary-deep mr-auto">Clients</h2>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client…"
              className="pl-9 rounded-2xl bg-secondary/40 border-0 h-10 w-64"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <SelectTrigger className="rounded-2xl h-10 w-44 bg-secondary/40 border-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partially paid</SelectItem>
              <SelectItem value="full">Fully paid</SelectItem>
              <SelectItem value="overdue">Overdue (7+ days)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="glass-card p-8 text-center text-muted-foreground">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-2">
            <p className="text-primary-deep font-semibold">No clients yet.</p>
            <p className="text-sm text-muted-foreground">
              <Link to="/advocate/clients" className="text-primary hover:underline">Add your first client</Link> to start tracking payments.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {clients
              .map((c) => {
                const fa = arrangements[c.id] ?? null;
                const pays = paymentsByClient[c.id] ?? [];
                const paid = pays.filter((p: any) => p.paid).reduce((s, p: any) => s + Number(p.amount), 0);
                const total = Number(fa?.total_amount ?? 0);
                const remaining = Math.max(0, total - paid);
                const overdue = pays.some((p: any) => p.invoice_given && !p.paid && isOverdueSevenDays(p.invoice_given_at));
                const svcStatus = paymentStatus(total, paid, fa?.payment_arrangement ?? null);
                const tier = fa?.service_tier_id ? tierById[fa.service_tier_id] : null;
                const lastPaid = pays.filter((p: any) => p.paid).sort((a: any, b: any) =>
                  new Date(b.paid_at || 0).getTime() - new Date(a.paid_at || 0).getTime())[0];
                return { c, fa, pays, paid, total, remaining, overdue, svcStatus, tier, lastPaid };
              })
              .filter(({ c, svcStatus, overdue }) => {
                if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
                if (filter === "all") return true;
                if (filter === "overdue") return overdue;
                if (filter === "unpaid") return svcStatus.key === "unpaid";
                if (filter === "partial") return svcStatus.key === "half_paid";
                if (filter === "full") return svcStatus.key === "full_paid" || svcStatus.key === "waived";
                return true;
              })
              .map(({ c, fa, paid, total, remaining, overdue, svcStatus, tier, lastPaid }) => {
                const isOpen = expanded === c.id;
                const tone: "complete" | "partial" | "pending" | "neutral" =
                  svcStatus.key === "full_paid" || svcStatus.key === "waived" ? "complete"
                  : svcStatus.key === "half_paid" ? "partial"
                  : total > 0 ? "pending" : "neutral";
                return (
                  <div key={c.id} className="glass-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="w-full p-5 flex items-center gap-4 text-left hover:bg-secondary/20 transition-calm"
                    >
                      <ClientAvatar name={c.name} gradient={c.avatarColor} colourKey={c.clientColour} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-primary-deep truncate">{c.name}</p>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-semibold",
                            tone === "complete" && "bg-primary/15 text-primary-deep",
                            tone === "partial"  && "bg-accent/20 text-primary-deep",
                            tone === "pending"  && "bg-secondary/60 text-primary-deep",
                            tone === "neutral"  && "bg-secondary/40 text-muted-foreground",
                          )}>{svcStatus.label}</span>
                          {overdue && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-accent/15 text-accent">
                              Overdue
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            <span className="text-primary-deep/70">Service:</span>{" "}
                            {tier?.name ?? (fa?.service_tier_id ? "Tier" : fa ? "Custom" : "—")}
                          </span>
                          {fa?.payment_arrangement && (
                            <span>
                              <span className="text-primary-deep/70">Arrangement:</span>{" "}
                              {PAYMENT_ARRANGEMENT_LABEL[fa.payment_arrangement as keyof typeof PAYMENT_ARRANGEMENT_LABEL]}
                            </span>
                          )}
                          <span>
                            <span className="text-primary-deep/70">Method:</span>{" "}
                            {lastPaid?.payment_method ? String(lastPaid.payment_method).replace(/_/g, " ") : "—"}
                          </span>
                          <span>
                            <span className="text-primary-deep/70">Remaining:</span>{" "}
                            {formatCurrency(remaining, settings.currency)}
                          </span>
                          <span>
                            <span className="text-primary-deep/70">Paid:</span>{" "}
                            {formatCurrency(paid, settings.currency)} of {formatCurrency(total, settings.currency)}
                          </span>
                        </div>
                      </div>
                      <Link
                        to={`/advocate/client/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                      >
                        Open file
                      </Link>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 -mt-1">
                        <ClientPaymentTracker
                          clientId={c.id}
                          clientName={c.name.split(" ")[0]}
                          compact
                          onAfterChange={() => setRefreshKey((k) => k + 1)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function SummaryCard({
  icon, label, value, tone, subtext,
}: { icon: React.ReactNode; label: string; value: string; tone: "primary" | "accent" | "neutral" | "soft"; subtext?: string }) {
  return (
    <div className="glass-card p-5">
      <div className={cn(
        "h-10 w-10 rounded-2xl flex items-center justify-center mb-3",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "accent"  && "bg-accent/15 text-accent",
        tone === "neutral" && "bg-secondary/60 text-primary-deep",
        tone === "soft"    && "bg-accent/10 text-accent",
      )}>{icon}</div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-display text-2xl text-primary-deep mt-1">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
    </div>
  );
}
