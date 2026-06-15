import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  LIFECYCLE_STATUSES, LifecycleStatus, lifecycleBadgeClass,
} from "@/lib/lifecycle-status";
import { CASE_OPEN_STATUSES } from "@/lib/cases-store";

interface Props {
  clientId: string;
  value: LifecycleStatus | null;
  onChanged?: (next: LifecycleStatus) => void;
}

export function LifecycleStatusSelect({ clientId, value, onChanged }: Props) {
  const [current, setCurrent] = useState<LifecycleStatus>(value ?? "New enquiry");
  const [saving, setSaving] = useState(false);
  const [pendingClose, setPendingClose] = useState<LifecycleStatus | null>(null);

  const persist = async (next: LifecycleStatus) => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ lifecycle_status: next })
      .eq("id", clientId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return false;
    }
    setCurrent(next);
    return true;
  };

  const handleChange = async (next: LifecycleStatus) => {
    if (next === current) return;
    const ok = await persist(next);
    if (!ok) return;

    if (next === "Completed" || next === "Inactive") {
      const { data, error: fetchErr } = await supabase
        .from("client_cases")
        .select("id")
        .eq("client_id", clientId)
        .in("case_status", CASE_OPEN_STATUSES);
      if (fetchErr) {
        toast({ title: "Couldn't check cases", description: fetchErr.message, variant: "destructive" });
        onChanged?.(next);
        return;
      }
      if ((data ?? []).length > 0) {
        // Defer the parent reload until the dialog is resolved — reloading now
        // unmounts this component and the dialog never shows.
        setPendingClose(next);
        return;
      }
    }
    onChanged?.(next);
  };

  const dismissDialog = () => {
    const next = pendingClose;
    setPendingClose(null);
    if (next) onChanged?.(next);
  };

  const closeOpenCases = async () => {
    const next = pendingClose;
    const { error } = await supabase
      .from("client_cases")
      .update({ case_status: "Closed", closed_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .in("case_status", CASE_OPEN_STATUSES);
    setPendingClose(null);
    if (error) {
      toast({ title: "Couldn't close cases", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cases closed", description: "All open cases for this client are now closed." });
    }
    if (next) onChanged?.(next);
  };

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Lifecycle:</span>
        <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold", lifecycleBadgeClass(current))}>
          {current}
        </span>
        <Select value={current} disabled={saving} onValueChange={(v) => handleChange(v as LifecycleStatus)}>
          <SelectTrigger className="h-10 rounded-full bg-secondary/40 border-0 text-sm font-medium w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIFECYCLE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AlertDialog open={!!pendingClose} onOpenChange={(o) => !o && dismissDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Close all open cases?</AlertDialogTitle>
            <AlertDialogDescription>
              This client's lifecycle is now <b>{pendingClose}</b>. Would you like to gently close any
              cases that are still open?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Leave them open</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); closeOpenCases(); }}
              className="rounded-full"
            >
              Yes, close all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
