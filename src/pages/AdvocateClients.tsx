import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AppShell } from "@/components/ocean/AppShell";
import { ClientAvatar } from "@/components/ocean/ClientAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useClients } from "@/lib/clients-store";
import { Search, Users, Mail, Trash2, Palette, DollarSign, CheckCircle2 } from "lucide-react";
import { InviteClientDialog } from "@/components/ocean/InviteClientDialog";
import { CopyInviteLinkButton } from "@/components/ocean/CopyInviteLinkButton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CLIENT_COLOURS, ClientCase, ClientColourKey, ClientPaymentStatus, ClientReportStatus, ClientTier,
  PAYMENT_STATUS_LABEL, REPORT_STATUS_LABEL, TIER_LABEL,
} from "@/lib/types";
import {
  LIFECYCLE_STATUSES, LifecycleStatus, lifecycleBadgeClass, lifecycleSortIndex,
} from "@/lib/lifecycle-status";

function StatusPill({ status, finalised }: { status?: "invited" | "needs_password_change" | "active"; finalised?: boolean }) {
  if (finalised) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold"
        style={{ backgroundColor: "hsl(10 65% 88%)", color: "hsl(10 45% 28%)" }}
      >
        <CheckCircle2 className="h-3 w-3" /> Finalised
      </span>
    );
  }
  const map = {
    invited: { label: "Invited — not yet activated", cls: "bg-secondary text-primary-deep" },
    needs_password_change: { label: "Needs password change", cls: "bg-accent/30 text-primary-deep" },
    active: { label: "Active", cls: "bg-primary/15 text-primary-deep" },
  } as const;
  const s = map[status ?? "active"];
  return <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold", s.cls)}>{s.label}</span>;
}

const PAYMENT_FILL: Record<ClientPaymentStatus, string> = {
  unpaid: "hsl(210 20% 70%)",
  half_paid: "hsl(150 45% 55%)",
  full_paid: "hsl(150 55% 42%)",
};

function PaymentDollar({
  value,
  onPick,
}: {
  value: ClientPaymentStatus;
  onPick: (v: ClientPaymentStatus) => void;
}) {
  const color = PAYMENT_FILL[value];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-secondary/40 hover:bg-secondary/60 transition-calm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          aria-label={`Payment: ${PAYMENT_STATUS_LABEL[value]}`}
          title={PAYMENT_STATUS_LABEL[value]}
        >
          {value === "half_paid" ? (
            <span className="relative inline-flex">
              <DollarSign className="h-4 w-4" style={{ color: "hsl(210 20% 60%)" }} />
              <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                <DollarSign className="h-4 w-4" style={{ color }} />
              </span>
            </span>
          ) : (
            <DollarSign className="h-4 w-4" style={{ color }} strokeWidth={value === "full_paid" ? 2.5 : 2} />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1 rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {(Object.keys(PAYMENT_STATUS_LABEL) as ClientPaymentStatus[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-secondary/60 transition-calm",
              k === value && "bg-secondary/50 font-semibold"
            )}
          >
            <DollarSign className="h-4 w-4" style={{ color: PAYMENT_FILL[k] }} />
            {PAYMENT_STATUS_LABEL[k]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const REPORT_PILL_STYLE: Record<ClientReportStatus, string> = {
  not_started: "hsl(210 25% 85%)",
  in_progress: "hsl(200 70% 78%)",
  completed:   "hsl(155 40% 65%)",
  updating:    "hsl(180 40% 65%)",
  finished:    "hsl(205 55% 55%)",
};
const REPORT_PILL_TEXT: Record<ClientReportStatus, string> = {
  not_started: "hsl(210 35% 25%)",
  in_progress: "hsl(210 40% 22%)",
  completed:   "hsl(180 30% 18%)",
  updating:    "hsl(180 30% 18%)",
  finished:    "hsl(0 0% 100%)",
};

function ColourPicker({ value, onPick }: { value: ClientColourKey; onPick: (k: ClientColourKey) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-2 rounded-full"
          onClick={(e) => e.stopPropagation()}
          aria-label="Choose client colour"
        >
          <span
            className="h-4 w-4 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: CLIENT_COLOURS[value].bg }}
          />
          <Palette className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-muted-foreground mb-2">Pick a calm colour</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(CLIENT_COLOURS) as ClientColourKey[]).map((k) => {
            const c = CLIENT_COLOURS[k];
            const selected = k === value;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onPick(k)}
                className={cn(
                  "h-9 w-9 rounded-full transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
                  selected && "ring-2 ring-offset-2 ring-primary"
                )}
                style={{ backgroundColor: c.bg }}
                title={c.label}
                aria-label={c.label}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AdvocateClients() {
  const { clients, loading, reload } = useClients();
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<ClientCase | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const initialLifecycle = (typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("lifecycle") as LifecycleStatus | null)
    : null);
  const [lifecycleFilter, setLifecycleFilter] = useState<"all" | LifecycleStatus>(initialLifecycle ?? "all");

  const visibleClients = (lifecycleFilter === "all"
    ? clients
    : clients.filter((c) => c.lifecycleStatus === lifecycleFilter)
  ).slice().sort((a, b) => {
    const da = lifecycleSortIndex(a.lifecycleStatus);
    const db = lifecycleSortIndex(b.lifecycleStatus);
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });

  const updateField = async (
    id: string,
    patch: Partial<{ tier: ClientTier; report_status: ClientReportStatus; client_colour: ClientColourKey; payment_status: ClientPaymentStatus }>,
  ) => {
    setSavingId(id);
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    setSavingId(null);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    reload();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-client", {
        body: { user_id: pendingDelete.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Client removed", description: `${pendingDelete.name} and their records were removed.` });
      setPendingDelete(null);
      reload();
    } catch (err: any) {
      toast({ title: "Couldn't remove client", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const resend = async (email: string) => {
    const issued = (() => {
      try { return !!localStorage.getItem(`invite-issued:${email.toLowerCase()}`); } catch { return false; }
    })();
    if (issued) {
      const ok = window.confirm(
        `You've already generated an invite link for ${email}. Sending a fresh email will deactivate any link you already shared (WhatsApp, SMS, copy-paste). Continue?`
      );
      if (!ok) return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("resend-client-invite", {
        body: { email, redirect_to: `${window.location.origin}/welcome` },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      try { localStorage.setItem(`invite-issued:${email.toLowerCase()}`, new Date().toISOString()); } catch { /* ignore */ }
      toast({ title: "Invite re-sent 💌", description: `A fresh link is on its way to ${email}. Any previous link is now invalid.` });
    } catch (err: any) {
      toast({ title: "Couldn't resend", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AppShell role="advocate" title="Clients" subtitle="All open cases, sorted alphabetically.">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search clients" placeholder="Search clients..." className="h-12 pl-11 rounded-2xl bg-card" />
        </div>
        <Select value={lifecycleFilter} onValueChange={(v) => setLifecycleFilter(v as typeof lifecycleFilter)}>
          <SelectTrigger className="h-12 rounded-2xl bg-card border-0 w-full sm:w-[220px]" aria-label="Filter by lifecycle status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lifecycle stages</SelectItem>
            {LIFECYCLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <InviteClientDialog onCreated={reload} />
      </div>

      <h2 className="sr-only">Client list</h2>
      {!loading && clients.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/10 text-primary items-center justify-center mb-4">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="font-display text-xl text-primary-deep">No clients yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Invite your first client to start a calm case.</p>
          <div className="mt-5 flex justify-center"><InviteClientDialog onCreated={reload} /></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visibleClients.map((c) => (
            <div key={c.id} className="glass-card p-6 hover:shadow-float hover:-translate-y-0.5 transition-calm relative">
              <button
                type="button"
                onClick={() => setPendingDelete(c)}
                className="absolute top-3 right-3 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-calm"
                aria-label={`Remove ${c.name}`}
                title="Remove client"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <div
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a, [role='menuitem'], [data-radix-popper-content-wrapper]")) return;
                  navigate(`/advocate/client/${c.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/advocate/client/${c.id}`);
                }}
                className="flex items-start gap-4 pr-10 cursor-pointer"
              >
                <ClientAvatar name={c.name} gradient={c.avatarColor} colourKey={c.clientColour} size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg text-primary-deep truncate">{c.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{c.email}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {c.lifecycleStatus && (
                      <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold", lifecycleBadgeClass(c.lifecycleStatus))}>
                        {c.lifecycleStatus}
                      </span>
                    )}
                    <StatusPill status={c.status} finalised={c.reportStatus === "finished"} />
                    <PaymentDollar
                      value={c.paymentState}
                      onPick={(v) => updateField(c.id, { payment_status: v })}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 items-center">
                <Select
                  value={c.tier}
                  disabled={savingId === c.id}
                  onValueChange={(v) => updateField(c.id, { tier: v as ClientTier })}
                >
                  <SelectTrigger
                    className="h-9 rounded-full bg-secondary/40 border-0 text-sm font-semibold w-full sm:w-[120px]"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Service tier"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIER_LABEL) as ClientTier[]).map((t) => (
                      <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={c.reportStatus}
                  disabled={savingId === c.id}
                  onValueChange={(v) => updateField(c.id, { report_status: v as ClientReportStatus })}
                >
                  <SelectTrigger
                    className="h-9 rounded-full border-0 text-sm font-semibold w-full"
                    style={{
                      backgroundColor: REPORT_PILL_STYLE[c.reportStatus],
                      color: REPORT_PILL_TEXT[c.reportStatus],
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Report status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(REPORT_STATUS_LABEL) as ClientReportStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{REPORT_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ColourPicker
                  value={c.clientColour}
                  onPick={(k) => updateField(c.id, { client_colour: k })}
                />
              </div>

              {c.status === "invited" && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <CopyInviteLinkButton email={c.email} variant="outline" />
                  <Button size="sm" variant="ghost" className="gap-2" onClick={() => resend(c.email)}>
                    <Mail className="h-3.5 w-3.5" /> Email invite
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will gently remove their profile, tasks, appointments, documents and check-ins.
              This can't be undone — take your time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="rounded-full">Keep client</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing…" : "Yes, remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
