import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  PaymentArrangement, PAYMENT_ARRANGEMENT_LABEL, PAYMENT_METHODS,
  issuePaymentRequest, markAgreementsCompletedExternally,
  paymentStatus, selectClientService, setGatingOverride,
  useClientServicePayment, useServiceTiers,
} from "@/lib/service-payment-store";
import { useAgreements } from "@/lib/agreements-store";
import {
  Briefcase, Copy, ExternalLink, FileCheck2, HandCoins, Lock,
  Send, Sparkles, Unlock, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sb = supabase as unknown as { rpc: (n: string, a?: any) => any };

const CUSTOM_SLUG = "__custom__";

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);
}

export function ServicePaymentSection({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const { toast } = useToast();
  const { tiers } = useServiceTiers();
  const { arrangement, paidTotal, gatingOverride, loading, reload } = useClientServicePayment(clientId);
  const { docs, acceptedDocIds, allRequiredAccepted, reload: reloadAgreements } = useAgreements(clientId);

  // ----- service form state
  const [tierId, setTierId] = useState<string>("");          // either tier UUID, CUSTOM_SLUG, or ""
  const [total, setTotal] = useState<string>("");
  const [arr, setArr] = useState<PaymentArrangement>("upfront_100");
  const [notes, setNotes] = useState<string>("");
  const [savingService, setSavingService] = useState(false);

  useEffect(() => {
    if (loading) return;
    setTierId(arrangement?.service_tier_id ?? (arrangement?.payment_arrangement ? CUSTOM_SLUG : ""));
    setTotal(arrangement?.total_amount ? String(arrangement.total_amount) : "");
    setArr(arrangement?.payment_arrangement ?? "upfront_100");
    setNotes(arrangement?.notes ?? "");
  }, [loading, arrangement?.service_tier_id, arrangement?.total_amount, arrangement?.payment_arrangement, arrangement?.notes]);

  const selectedTier = tiers.find((t) => t.id === tierId) ?? null;

  const onTierChange = (v: string) => {
    setTierId(v);
    const t = tiers.find((x) => x.id === v);
    if (t) setTotal(String(t.price_aud));
  };

  const saveService = async () => {
    if (!tierId) {
      toast({ title: "Pick a service first", variant: "destructive" });
      return;
    }
    setSavingService(true);
    const err = await selectClientService({
      clientId,
      tierId: selectedTier?.id ?? null,
      tierSlug: selectedTier?.slug ?? null,
      total: Number(total) || 0,
      arrangement: arr,
      notes,
    });
    setSavingService(false);
    if (err) { toast({ title: "Couldn't save", description: err, variant: "destructive" }); return; }
    toast({ title: "Service saved" });
    reload();
  };

  // ----- agreements externally
  const [extOpen, setExtOpen] = useState(false);
  const [extNotes, setExtNotes] = useState("");
  const [extSaving, setExtSaving] = useState(false);
  const confirmExternalAgreements = async () => {
    setExtSaving(true);
    const err = await markAgreementsCompletedExternally(clientId, extNotes);
    setExtSaving(false);
    if (err) { toast({ title: "Couldn't save", description: err, variant: "destructive" }); return; }
    toast({ title: "Recorded externally", description: "Agreements marked as completed outside the app." });
    setExtOpen(false); setExtNotes("");
    reload(); reloadAgreements();
  };

  // ----- payment request
  const status = arrangement
    ? paymentStatus(arrangement.total_amount, paidTotal, arrangement.payment_arrangement)
    : { key: "unpaid", label: "No service yet" };
  const remaining = Math.max(0, (arrangement?.total_amount ?? 0) - paidTotal);

  const paymentLink = arrangement?.external_payment_link_url || selectedTier?.stripe_payment_link || null;

  const [issuing, setIssuing] = useState(false);
  const issueRequest = async () => {
    setIssuing(true);
    const err = await issuePaymentRequest(clientId);
    setIssuing(false);
    if (err) { toast({ title: "Couldn't send request", description: err, variant: "destructive" }); return; }
    toast({ title: "Payment request sent" });
    reload();
  };

  const copyLink = async () => {
    if (!paymentLink) return;
    await navigator.clipboard.writeText(paymentLink);
    toast({ title: "Link copied" });
  };

  // ----- manual payment
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const recordManualPayment = async () => {
    setPaySaving(true);
    const ref = payDate ? `Date: ${payDate}${payNotes ? ` — ${payNotes}` : ""}` : payNotes;
    const { error } = await sb.rpc("mark_paid_manually", {
      _client_id: clientId,
      _method: payMethod,
      _notes: ref || null,
      _amount: payAmount ? Number(payAmount) : 0,
    });
    setPaySaving(false);
    if (error) { toast({ title: "Couldn't record", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Payment recorded" });
    setPayOpen(false); setPayAmount(""); setPayNotes("");
    reload();
  };

  // ----- gating override
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const toggleOverride = async (enabled: boolean) => {
    if (enabled) { setOverrideOpen(true); return; }
    setOverrideSaving(true);
    const err = await setGatingOverride(clientId, false, "");
    setOverrideSaving(false);
    if (err) { toast({ title: "Couldn't update", description: err, variant: "destructive" }); return; }
    toast({ title: "Override removed" });
    reload();
  };
  const confirmOverride = async () => {
    if (!overrideReason.trim()) return;
    setOverrideSaving(true);
    const err = await setGatingOverride(clientId, true, overrideReason.trim());
    setOverrideSaving(false);
    if (err) { toast({ title: "Couldn't update", description: err, variant: "destructive" }); return; }
    toast({ title: "Override enabled" });
    setOverrideOpen(false); setOverrideReason("");
    reload();
  };

  const isFullyPaid = status.key === "full_paid" || status.key === "waived";
  const workUnlocked = gatingOverride || isFullyPaid;
  const requiredDocs = docs.filter((d) => d.required);

  return (
    <section className="glass-card p-6 space-y-6">
      <header className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl text-primary-deep">Service & Payment</h2>
        <span className="ml-auto text-xs text-muted-foreground">Advocate-only</span>
      </header>

      {/* 1. Service selection */}
      <div className="rounded-2xl bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary-deep" />
          <p className="font-semibold text-primary-deep">Service</p>
          {!arrangement?.service_selected_at && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold">
              Not selected yet
            </span>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Service tier</Label>
            <Select value={tierId} onValueChange={onTierChange}>
              <SelectTrigger className="rounded-xl h-11 mt-1">
                <SelectValue placeholder="Choose a service…" />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {fmt(t.price_aud)}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_SLUG}>Custom service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Agreed total (AUD)</Label>
            <Input
              type="number" min={0} value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="e.g. 380"
              className="rounded-xl h-11 mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Payment arrangement</Label>
            <Select value={arr} onValueChange={(v) => setArr(v as PaymentArrangement)}>
              <SelectTrigger className="rounded-xl h-11 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_ARRANGEMENT_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Internal notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Context for this arrangement…"
              className="rounded-xl mt-1 resize-none" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveService} disabled={savingService || !tierId} className="rounded-2xl bg-gradient-ocean">
            {savingService ? "Saving…" : "Save service & arrangement"}
          </Button>
        </div>
      </div>

      {/* 2. Agreements */}
      <div className="rounded-2xl bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-primary-deep" />
          <p className="font-semibold text-primary-deep">Agreements</p>
          <span className={cn("ml-auto text-xs px-2 py-0.5 rounded-full font-semibold",
            allRequiredAccepted ? "bg-primary/15 text-primary-deep" : "bg-accent/15 text-accent")}>
            {allRequiredAccepted
              ? "All required accepted"
              : `${requiredDocs.filter(d => acceptedDocIds.has(d.id)).length}/${requiredDocs.length} accepted`}
          </span>
        </div>
        {arrangement?.agreements_completed_method === "external" && (
          <p className="text-xs text-muted-foreground">
            Marked completed externally{arrangement.agreements_completed_notes ? ` — ${arrangement.agreements_completed_notes}` : ""}
          </p>
        )}
        <div>
          <Button variant="outline" className="rounded-2xl" onClick={() => setExtOpen(true)}>
            Mark agreements completed externally
          </Button>
        </div>
      </div>

      {/* 3. Payment request */}
      <div className="rounded-2xl bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary-deep" />
          <p className="font-semibold text-primary-deep">Payment request</p>
          {arrangement?.payment_request_issued_at && (
            <span className="ml-auto text-xs text-muted-foreground">
              Issued {new Date(arrangement.payment_request_issued_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="grid sm:grid-cols-3 gap-2 text-sm">
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Total agreed</p>
            <p className="font-display text-lg text-primary-deep">{fmt(arrangement?.total_amount ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Paid so far</p>
            <p className="font-display text-lg text-primary-deep">{fmt(paidTotal)}</p>
          </div>
          <div className="rounded-xl bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="font-display text-lg text-primary-deep">{fmt(remaining)}</p>
          </div>
        </div>
        {paymentLink && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground truncate flex-1">{paymentLink}</span>
            <Button size="sm" variant="outline" className="rounded-full" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
            <a href={paymentLink} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="rounded-full">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
              </Button>
            </a>
          </div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={issueRequest}
            disabled={issuing || !arrangement?.service_selected_at}
            className="rounded-2xl"
          >
            {arrangement?.payment_request_issued_at ? "Resend payment request" : "Send payment request"}
          </Button>
        </div>
        {!arrangement?.service_selected_at && (
          <p className="text-xs text-muted-foreground">Select a service first.</p>
        )}
      </div>

      {/* 4. Manual payment */}
      <div className="rounded-2xl bg-secondary/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-primary-deep" />
          <p className="font-semibold text-primary-deep">Manual payment</p>
        </div>
        {!payOpen ? (
          <Button variant="outline" className="rounded-2xl" onClick={() => setPayOpen(true)}>
            Mark payment received manually
          </Button>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Payment method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="rounded-xl h-11 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount (AUD)</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                placeholder="e.g. 190" className="rounded-xl h-11 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Payment date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                className="rounded-xl h-11 mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Notes / reference</Label>
              <Textarea rows={2} value={payNotes} onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Reference no., context…"
                className="rounded-xl mt-1 resize-none" />
            </div>
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button variant="ghost" className="rounded-2xl" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button onClick={recordManualPayment} disabled={paySaving} className="rounded-2xl bg-gradient-ocean">
                {paySaving ? "Recording…" : "Confirm payment"}
              </Button>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Partial payments mark status as partially paid; only the full agreed amount unlocks paid work.
        </p>
      </div>

      {/* 5. Work gate */}
      <div className={cn("rounded-2xl p-4 space-y-3 border",
        workUnlocked ? "bg-primary/5 border-primary/20" : "bg-accent/10 border-accent/30")}>
        <div className="flex items-center gap-2">
          {workUnlocked ? <Unlock className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-accent" />}
          <p className="font-semibold text-primary-deep">Work gate</p>
          <span className="ml-auto text-xs font-semibold">
            {workUnlocked
              ? (gatingOverride ? "Unlocked (advocate override)" : "Unlocked — payment complete")
              : status.key === "half_paid" ? "Partially paid — work remains locked" : "Locked — payment required"}
          </span>
        </div>
        {gatingOverride && arrangement?.gating_override_reason && (
          <p className="text-xs text-muted-foreground">
            Override reason: {arrangement.gating_override_reason}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-primary-deep">Allow work to begin without full payment</p>
            <p className="text-xs text-muted-foreground">
              For pro bono, external plans, urgent cases, or special arrangements.
            </p>
          </div>
          <Switch checked={gatingOverride} onCheckedChange={toggleOverride} disabled={overrideSaving} />
        </div>
      </div>

      {/* --- dialogs --- */}
      <AlertDialog open={extOpen} onOpenChange={setExtOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark agreements completed externally</AlertDialogTitle>
            <AlertDialogDescription>
              This records that {clientName ?? "the client"} accepted the required agreements outside the app
              (e.g. signed PDF or in-person). The standard "agreements completed" automation will run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Notes (required) — when / how / which documents</Label>
            <Textarea rows={3} value={extNotes} onChange={(e) => setExtNotes(e.target.value)}
              placeholder="e.g. Signed PDF on 12 Jun, returned by email"
              className="rounded-xl resize-none" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmExternalAgreements(); }}
              disabled={!extNotes.trim() || extSaving}>
              {extSaving ? "Saving…" : "Record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow work without full payment</AlertDialogTitle>
            <AlertDialogDescription>
              This bypasses the payment gate. Record why — it'll be stored with your name and timestamp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Reason (required)</Label>
            <Textarea rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Pro bono — agreed by team; or external payment plan"
              className="rounded-xl resize-none" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmOverride(); }}
              disabled={!overrideReason.trim() || overrideSaving}>
              {overrideSaving ? "Saving…" : "Allow work"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
