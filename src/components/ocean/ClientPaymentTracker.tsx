import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClientPayment,
  FeeArrangement,
  FeeModel,
  ensureTierMilestones,
  formatCurrency,
  isOverdueSevenDays,
  statusLabel,
  useClientPaymentTracker,
  usePaymentSettings,
} from "@/lib/payments-store";
import { Wallet, Plus, Trash2, Receipt, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  clientName?: string;
  compact?: boolean;
  onAfterChange?: () => void;
}

export function ClientPaymentTracker({ clientId, clientName, compact = false, onAfterChange }: Props) {
  const { arrangement, payments, loading, reload } = useClientPaymentTracker(clientId);
  const { settings } = usePaymentSettings();
  const notify = () => { reload(); onAfterChange?.(); };
  const [reminderLog, setReminderLog] = useState<Record<string, string>>({});

  const [total, setTotal] = useState("");
  const [model, setModel] = useState<FeeModel>("tier_50_50");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (arrangement) {
      setTotal(arrangement.total_amount ? String(arrangement.total_amount) : "");
      setModel(arrangement.model);
      setNotes(arrangement.notes);
    } else {
      setTotal("");
      setModel("tier_50_50");
      setNotes("");
    }
  }, [arrangement, clientId]);

  const saveArrangement = async () => {
    setSaving(true);
    const totalNum = Number(total) || 0;
    const { error } = await supabase
      .from("client_fee_arrangements")
      .upsert(
        { client_id: clientId, total_amount: totalNum, model, notes },
        { onConflict: "client_id" },
      );
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    if (model === "tier_50_50" && totalNum > 0) {
      await ensureTierMilestones(clientId, totalNum);
    }
    setSaving(false);
    toast({ title: "Saved", description: "Fee arrangement updated." });
    notify();
  };

  useEffect(() => {
    if (payments.length === 0) { setReminderLog({}); return; }
    let cancelled = false;
    (async () => {
      const ids = payments.map((p) => p.id);
      const { data } = await supabase
        .from("payment_reminders_log")
        .select("payment_id, sent_at")
        .in("payment_id", ids)
        .order("sent_at", { ascending: false });
      if (cancelled) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (!map[r.payment_id]) map[r.payment_id] = r.sent_at; });
      setReminderLog(map);
    })();
    return () => { cancelled = true; };
  }, [payments]);

  const status = statusLabel(arrangement, payments);
  const overdueCount = payments.filter(
    (p) => p.invoice_given && !p.paid && isOverdueSevenDays(p.invoice_given_at),
  ).length;

  return (
    <section className={cn("glass-card", compact ? "p-5" : "p-6")}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className={cn("font-display text-primary-deep", compact ? "text-lg" : "text-xl")}>
          Payment tracker
        </h2>
        <span className="text-xs text-muted-foreground">(advocate-only)</span>
        <span
          className={cn(
            "ml-auto text-xs px-2.5 py-1 rounded-full font-semibold",
            status.tone === "complete" && "bg-primary/15 text-primary-deep",
            status.tone === "partial"  && "bg-accent/20 text-primary-deep",
            status.tone === "pending"  && "bg-secondary/60 text-primary-deep",
            status.tone === "neutral"  && "bg-secondary/40 text-muted-foreground",
          )}
        >
          {status.label}
        </span>
      </div>

      {overdueCount > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl p-3 bg-accent/10 border border-accent/20">
          <Waves className="h-4 w-4 mt-0.5 text-accent flex-shrink-0" />
          <p className="text-sm text-primary-deep leading-snug">
            {clientName ? `${clientName}'s ` : "This client's "}
            {overdueCount === 1 ? "payment has" : `${overdueCount} payments have`} been pending for a while — a gentle follow-up might help.
          </p>
        </div>
      )}

      {/* Fee arrangement */}
      <div className="grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground" htmlFor={`total-${clientId}`}>
            Total agreed ({settings.currency})
          </label>
          <Input
            id={`total-${clientId}`}
            type="number"
            min={0}
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0"
            disabled={loading}
            className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fee model</label>
          <Select value={model} onValueChange={(v) => setModel(v as FeeModel)}>
            <SelectTrigger className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tier_50_50">Tier — 50% / 50%</SelectItem>
              <SelectItem value="custom">Custom arrangement</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={saveArrangement}
          disabled={saving || loading}
          className="rounded-full h-10"
        >
          {saving ? "Saving…" : "Save arrangement"}
        </Button>
      </div>

      <div className="mt-3">
        <label className="text-xs text-muted-foreground" htmlFor={`notes-${clientId}`}>
          Notes (optional)
        </label>
        <Textarea
          id={`notes-${clientId}`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any context about this arrangement — ongoing engagement, partial payments, etc."
          className="mt-1 rounded-2xl bg-secondary/40 border-0 resize-none"
        />
      </div>

      {/* Milestones */}
      <div className="mt-5 space-y-3">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {model === "tier_50_50"
              ? "Save the arrangement to create the deposit & final milestones."
              : "Add a payment entry below."}
          </p>
        ) : (
          payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              currency={settings.currency}
              isCustomModel={model === "custom"}
              reminderSentAt={reminderLog[p.id]}
              onChange={notify}
            />
          ))
        )}

        {model === "custom" && (
          <AddCustomPayment
            clientId={clientId}
            currency={settings.currency}
            onAdded={notify}
            nextOrder={(payments.at(-1)?.sort_order ?? -1) + 1}
          />
        )}
      </div>
    </section>
  );
}

function PaymentRow({
  payment,
  currency,
  isCustomModel,
  reminderSentAt,
  onChange,
}: {
  payment: ClientPayment;
  currency: string;
  isCustomModel: boolean;
  reminderSentAt?: string;
  onChange: () => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [label, setLabel] = useState(payment.label);

  useEffect(() => {
    setAmount(String(payment.amount));
    setLabel(payment.label);
  }, [payment.id, payment.amount, payment.label]);

  const update = async (patch: Partial<ClientPayment>) => {
    const { error } = await supabase
      .from("client_payments")
      .update(patch)
      .eq("id", payment.id);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    onChange();
  };

  const remove = async () => {
    if (!confirm("Remove this payment entry?")) return;
    const { error } = await supabase.from("client_payments").delete().eq("id", payment.id);
    if (error) {
      toast({ title: "Couldn't remove", description: error.message, variant: "destructive" });
      return;
    }
    onChange();
  };

  const overdue = payment.invoice_given && !payment.paid && isOverdueSevenDays(payment.invoice_given_at);

  return (
    <div
      className={cn(
        "rounded-2xl p-4 transition-calm",
        payment.paid
          ? "bg-primary/5 border border-primary/15"
          : overdue
          ? "bg-accent/5 border border-accent/20"
          : "bg-secondary/30 border border-transparent",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {isCustomModel && payment.kind === "custom" ? (
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label !== payment.label && update({ label })}
            placeholder="Payment label"
            className="h-9 rounded-xl bg-background border-0 flex-1 min-w-[160px] text-sm"
          />
        ) : (
          <p className="font-semibold text-sm text-primary-deep flex-1 min-w-[160px]">
            {payment.label}
          </p>
        )}

        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => Number(amount) !== payment.amount && update({ amount: Number(amount) || 0 })}
            className="h-9 w-28 rounded-xl bg-background border-0 text-sm text-right"
          />
          <span className="text-xs text-muted-foreground">{currency}</span>
        </div>

        {isCustomModel && payment.kind === "custom" && (
          <button
            onClick={remove}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-calm flex items-center justify-center"
            aria-label="Remove payment"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        <label className="flex items-center gap-3 rounded-xl p-2 bg-background/60 cursor-pointer">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm flex-1">
            Invoice given
            {payment.invoice_given_at && (
              <span className="block text-xs text-muted-foreground">
                {new Date(payment.invoice_given_at).toLocaleDateString()}
              </span>
            )}
          </span>
          <Switch
            checked={payment.invoice_given}
            onCheckedChange={(v) => update({ invoice_given: v })}
          />
        </label>

        <label className="flex items-center gap-3 rounded-xl p-2 bg-background/60 cursor-pointer">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm flex-1">
            Payment received
            {payment.paid_at && (
              <span className="block text-xs text-muted-foreground">
                {new Date(payment.paid_at).toLocaleDateString()}
              </span>
            )}
          </span>
          <Switch
            checked={payment.paid}
            onCheckedChange={(v) => update({ paid: v })}
          />
        </label>
      </div>

      {overdue && (
        <p className="mt-2 text-xs text-primary-deep/80">
          Invoice was sent {Math.floor((Date.now() - new Date(payment.invoice_given_at!).getTime()) / 86400000)} days ago.
        </p>
      )}
      {reminderSentAt && !payment.paid && (
        <p className="mt-1 text-xs text-primary/80">
          ✉ Reminder email sent {new Date(reminderSentAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function AddCustomPayment({
  clientId,
  currency,
  onAdded,
  nextOrder,
}: {
  clientId: string;
  currency: string;
  onAdded: () => void;
  nextOrder: number;
}) {
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    const { error } = await supabase.from("client_payments").insert({
      client_id: clientId,
      kind: "custom",
      label: "Payment",
      amount: 0,
      sort_order: nextOrder,
    });
    setAdding(false);
    if (error) {
      toast({ title: "Couldn't add", description: error.message, variant: "destructive" });
      return;
    }
    onAdded();
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={add}
      disabled={adding}
      className="rounded-full"
    >
      <Plus className="h-3.5 w-3.5 mr-1.5" /> {adding ? "Adding…" : "Add a payment entry"}
    </Button>
  );
}

export { formatCurrency };
