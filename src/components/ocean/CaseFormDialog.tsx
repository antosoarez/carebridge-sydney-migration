import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CASE_PAYMENT_STATES, CASE_STATUSES, COMPLEXITY_LEVELS, ClientCaseRow,
  SERVICE_TYPES, CaseStatus, ServiceType, CasePaymentState, ComplexityLevel,
} from "@/lib/cases-store";
import { TIER_LABEL, ClientTier } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  existing?: ClientCaseRow | null;
  onSaved: (row: ClientCaseRow) => void;
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function CaseFormDialog({ open, onOpenChange, clientId, existing, onSaved }: Props) {
  const isEdit = !!existing;
  const [saving, setSaving] = useState(false);

  const [caseTitle, setCaseTitle] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("Appointment preparation");
  const [caseStatus, setCaseStatus] = useState<CaseStatus>("New");
  const [tier, setTier] = useState<ClientTier | "">("");
  const [paymentState, setPaymentState] = useState<CasePaymentState | "">("Unpaid");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [mainArea, setMainArea] = useState("");
  const [complexity, setComplexity] = useState<ComplexityLevel | "">("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDue, setNextActionDue] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setCaseTitle(existing.case_title);
      setServiceType(existing.service_type);
      setCaseStatus(existing.case_status);
      setTier((existing.tier as ClientTier) ?? "");
      setPaymentState(existing.payment_state ?? "");
      setPrimaryGoal(existing.primary_goal ?? "");
      setMainArea(existing.main_advocacy_area ?? "");
      setComplexity(existing.complexity_level ?? "");
      setNextAction(existing.next_action ?? "");
      setNextActionDue(toLocalInputValue(existing.next_action_due_at));
    } else {
      setCaseTitle("");
      setServiceType("Appointment preparation");
      setCaseStatus("New");
      setTier("");
      setPaymentState("Unpaid");
      setPrimaryGoal("");
      setMainArea("");
      setComplexity("");
      setNextAction("");
      setNextActionDue("");
    }
  }, [open, existing]);

  const save = async () => {
    if (!caseTitle.trim()) {
      toast({ title: "Add a case title", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      client_id: clientId,
      case_title: caseTitle.trim(),
      service_type: serviceType,
      case_status: caseStatus,
      tier: tier || null,
      payment_state: paymentState || null,
      primary_goal: primaryGoal.trim() || null,
      main_advocacy_area: mainArea.trim() || null,
      complexity_level: complexity || null,
      next_action: nextAction.trim() || null,
      next_action_due_at: nextActionDue ? new Date(nextActionDue).toISOString() : null,
    };

    let row: ClientCaseRow | null = null;
    let error;
    if (isEdit && existing) {
      const r = await supabase
        .from("client_cases")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      row = r.data as ClientCaseRow | null;
      error = r.error;
    } else {
      const { data: auth } = await supabase.auth.getUser();
      const r = await supabase
        .from("client_cases")
        .insert({ ...payload, created_by: auth.user?.id ?? "" })
        .select("*")
        .maybeSingle();
      row = r.data as ClientCaseRow | null;
      error = r.error;
    }
    setSaving(false);
    if (error || !row) {
      toast({ title: "Couldn't save case", description: error?.message, variant: "destructive" });
      return;
    }
    toast({ title: isEdit ? "Case updated" : "Case created" });
    onSaved(row);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit case" : "New case"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Case title *</label>
            <Input
              value={caseTitle}
              onChange={(e) => setCaseTitle(e.target.value)}
              placeholder="e.g. Endocrinologist follow-up Q3"
              className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Service type *</label>
              <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
                <SelectTrigger className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={caseStatus} onValueChange={(v) => setCaseStatus(v as CaseStatus)}>
                <SelectTrigger className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Tier</label>
              <Select value={tier || "__none"} onValueChange={(v) => setTier(v === "__none" ? "" : (v as ClientTier))}>
                <SelectTrigger className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {(Object.keys(TIER_LABEL) as ClientTier[]).map((t) => (
                    <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Payment state</label>
              <Select value={paymentState || "__none"} onValueChange={(v) => setPaymentState(v === "__none" ? "" : (v as CasePaymentState))}>
                <SelectTrigger className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {CASE_PAYMENT_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Complexity</label>
              <Select value={complexity || "__none"} onValueChange={(v) => setComplexity(v === "__none" ? "" : (v as ComplexityLevel))}>
                <SelectTrigger className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {COMPLEXITY_LEVELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Primary goal</label>
            <Textarea
              value={primaryGoal}
              onChange={(e) => setPrimaryGoal(e.target.value)}
              rows={2}
              className="mt-1 rounded-2xl bg-secondary/40 border-0 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Main advocacy area</label>
            <Input
              value={mainArea}
              onChange={(e) => setMainArea(e.target.value)}
              className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Next action</label>
              <Input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="e.g. Call clinic to confirm referral"
                className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Next action due</label>
              <Input
                type="datetime-local"
                value={nextActionDue}
                onChange={(e) => setNextActionDue(e.target.value)}
                className="mt-1 h-10 rounded-2xl bg-secondary/40 border-0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Setting this creates a follow-up task for you, deduped per case.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full" disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="rounded-full">
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
