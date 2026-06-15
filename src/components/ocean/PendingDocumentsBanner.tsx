import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface PendingDoc {
  id: string;
  name: string;
  client_id: string;
  created_at: string;
}

export function PendingDocumentsBanner() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("documents")
        .select("id,name,client_id,created_at")
        .eq("status", "pending_review")
        .order("created_at", { ascending: false });
      setPending(data ?? []);
    };
    load();

    const channel = supabase
      .channel("documents-pending")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (pending.length === 0) return null;

  const triageAll = async () => {
    if (!user) return;
    setBusy(true);
    const ids = pending.map(p => p.id);
    const { error } = await supabase
      .from("documents")
      .update({ status: "triaged", triaged_at: new Date().toISOString(), triaged_by: user.id })
      .in("id", ids);
    setBusy(false);
    if (error) {
      toast.error("Couldn't acknowledge — try again");
      return;
    }
    toast.success(`Moved ${ids.length} document${ids.length > 1 ? "s" : ""} to Secure Space`);
  };

  return (
    <div className="mb-6 glass-card p-5 border-2 border-status-overdue/40 bg-status-overdue/5 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 shrink-0 rounded-2xl bg-status-overdue/15 text-status-overdue flex items-center justify-center">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg text-primary-deep">
            New Document Pending Review — Move to Secure Space
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {pending.length} new upload{pending.length > 1 ? "s" : ""} from your clients waiting for triage.
          </p>
        </div>
        <Button
          onClick={triageAll}
          disabled={busy}
          className="rounded-2xl bg-gradient-ocean shadow-soft gap-2 shrink-0"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Acknowledge & Triage
        </Button>
      </div>
    </div>
  );
}
