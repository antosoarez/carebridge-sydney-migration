import { useMemo, useState } from "react";
import { Briefcase, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ClientCaseRow, caseStatusBadgeClass, useClientCases,
} from "@/lib/cases-store";
import { CaseFormDialog } from "./CaseFormDialog";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";

interface Props {
  clientId: string;
}

function isClosed(s: string) { return s === "Completed" || s === "Closed"; }

function fmtDue(iso: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  const overdue = ms < 0;
  const text = d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return { text, overdue };
}

function CaseCard({ row, onOpen }: { row: ClientCaseRow; onOpen: () => void }) {
  const due = fmtDue(row.next_action_due_at);
  const closed = isClosed(row.case_status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "text-left w-full rounded-2xl p-4 bg-card border border-border/60 hover:shadow-float hover:-translate-y-0.5 transition-calm",
        closed && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-display text-base text-primary-deep flex-1 min-w-0">{row.case_title}</h4>
        <span className={cn("text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap", caseStatusBadgeClass(row.case_status))}>
          {row.case_status}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/60 text-primary-deep">{row.service_type}</span>
        {row.tier && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground">{row.tier}</span>}
        {row.payment_state && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground">{row.payment_state}</span>}
        {row.complexity_level && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground">{row.complexity_level}</span>}
      </div>
      {row.next_action && (
        <p className="mt-3 text-sm text-primary-deep line-clamp-2">
          <span className="text-muted-foreground">Next: </span>{row.next_action}
        </p>
      )}
      {due && !closed && (
        <p className={cn("mt-1 text-xs flex items-center gap-1.5", due.overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
          {due.overdue && <AlertCircle className="h-3.5 w-3.5" />}
          {due.overdue ? "Overdue · " : "Due "}{due.text}
        </p>
      )}
    </button>
  );
}

export function ClientCasesPanel({ clientId }: Props) {
  const { rows, loading, reload } = useClientCases(clientId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientCaseRow | null>(null);
  const [askLifecycle, setAskLifecycle] = useState(false);

  const { open, closed } = useMemo(() => {
    return {
      open: rows.filter((r) => !isClosed(r.case_status)),
      closed: rows.filter((r) => isClosed(r.case_status)),
    };
  }, [rows]);

  const handleSaved = (row: ClientCaseRow) => {
    reload();
    if (isClosed(row.case_status)) {
      // Check if all cases are now closed
      const allClosed = rows
        .map((r) => r.id === row.id ? row : r)
        .every((r) => isClosed(r.case_status));
      if (allClosed && rows.length > 0) setAskLifecycle(true);
    }
  };

  const markClientCompleted = async () => {
    setAskLifecycle(false);
    const { error } = await supabase
      .from("profiles")
      .update({ lifecycle_status: "Completed" })
      .eq("id", clientId);
    if (error) {
      toast({ title: "Couldn't update status", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Client marked Completed" });
  };

  return (
    <section className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase className="h-4 w-4 text-primary" />
        <h2 className="font-display text-xl text-primary-deep">Cases</h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto rounded-full gap-1.5"
          onClick={() => { setEditing(null); setFormOpen(true); }}
        >
          <Plus className="h-4 w-4" /> New case
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cases yet. Create one to start tracking work for this client.</p>
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Open</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {open.map((r) => (
                  <CaseCard key={r.id} row={r} onOpen={() => { setEditing(r); setFormOpen(true); }} />
                ))}
              </div>
            </div>
          )}
          {closed.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Closed</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {closed.map((r) => (
                  <CaseCard key={r.id} row={r} onOpen={() => { setEditing(r); setFormOpen(true); }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CaseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        clientId={clientId}
        existing={editing}
        onSaved={handleSaved}
      />

      <AlertDialog open={askLifecycle} onOpenChange={setAskLifecycle}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>All cases closed</AlertDialogTitle>
            <AlertDialogDescription>
              Every case for this client is now closed. Update the client's lifecycle status to <b>Completed</b>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); markClientCompleted(); }}
              className="rounded-full"
            >
              Yes, mark Completed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
