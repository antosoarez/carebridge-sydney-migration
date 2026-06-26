import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HandCoins, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Advocate control for edge cases: client paid via bank transfer, a special
 * verbal deal, etc. Records a paid client_payments row via mark_paid_manually,
 * which fires the payment automation chain (lifecycle Active, payment_completed_at,
 * notifications) — advancing the client past the payment gate.
 */
export function ManualPaymentOverride({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("manual_bank");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("mark_paid_manually", {
      _client_id: clientId,
      _method: method,
      _notes: notes.trim() || null,
      _amount: amount ? Number(amount) : 0,
    });
    setSaving(false);
    if (error) { toast.error(error.message || "Couldn't record the payment"); return; }
    toast.success("Marked as paid — the client can now proceed.");
    setOpen(false);
    setAmount(""); setNotes("");
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <HandCoins className="h-4 w-4 text-warning" />
        <h2 className="font-display text-xl text-primary-deep">Manual payment override</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Use when {clientName ?? "the client"} paid outside Stripe (bank transfer, special deal). This marks them paid and advances them past the payment gate.
      </p>
      {!open ? (
        <Button variant="outline" className="rounded-2xl" onClick={() => setOpen(true)}>Mark as paid manually</Button>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="rounded-xl h-11 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_bank">Bank transfer</SelectItem>
                <SelectItem value="special_deal">Special deal / arranged</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount (AUD, optional)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="190" className="rounded-xl h-11 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Notes (why / reference)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Paid by bank transfer, ref 12345" rows={2} className="rounded-xl mt-1 resize-none" />
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={saving} className="rounded-2xl gap-2 bg-gradient-ocean">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirm paid
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-2xl">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
