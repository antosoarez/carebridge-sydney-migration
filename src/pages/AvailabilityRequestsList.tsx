import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Plus, CalendarRange, Trash2 } from "lucide-react";
import {
  AVAILABILITY_STATUS_LABEL,
  AVAILABILITY_STATUS_TONE,
  AvailabilityStatus,
  fmtShortDate,
} from "@/lib/availability-store";

interface Row {
  id: string;
  client_id: string;
  appointment_category: string;
  appointment_purpose: string | null;
  status: AvailabilityStatus;
  date_range_start: string;
  date_range_end: string;
  created_at: string;
  updated_at: string;
  client_responded_at: string | null;
  clientName: string;
}

type FilterKey = "all" | "drafts_sent" | "responses" | "clinic" | "confirmed" | "cancelled";

const FILTERS: Array<{ key: FilterKey; label: string; statuses: AvailabilityStatus[] | null }> = [
  { key: "all", label: "All", statuses: null },
  { key: "drafts_sent", label: "Drafts & sent", statuses: ["draft", "sent_to_client", "waiting_for_client"] },
  { key: "responses", label: "Responses received", statuses: ["client_responded", "ready_to_book"] },
  { key: "clinic", label: "Clinic stage", statuses: ["clinic_contacted"] },
  { key: "confirmed", label: "Confirmed", statuses: ["appointment_confirmed"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

const REVIEW_STATUSES: AvailabilityStatus[] = [
  "client_responded",
  "ready_to_book",
  "clinic_contacted",
  "appointment_confirmed",
  "cancelled",
];

export default function AvailabilityRequestsList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: reqs } = await supabase
        .from("availability_requests")
        .select("id, client_id, appointment_category, appointment_purpose, status, date_range_start, date_range_end, created_at, updated_at, client_responded_at")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      const ids = Array.from(new Set((reqs ?? []).map((r) => r.client_id)));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [] as any };
      const nameById = new Map<string, string>((profiles ?? []).map((p: any) => [p.id, p.full_name?.trim() || p.email || "Unknown client"]));
      if (cancelled) return;
      setRows((reqs ?? []).map((r: any) => ({ ...r, clientName: nameById.get(r.client_id) || "Unknown client" })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    if (!f.statuses) return rows;
    return rows.filter((r) => f.statuses!.includes(r.status));
  }, [rows, filter]);

  return (
    <AppShell
      role="advocate"
      seoTitle="Availability Requests"
      title="Availability Requests"
      subtitle="Calm coordination — ask clients when they could attend, before chasing the clinic."
    >
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length} request{rows.length === 1 ? "" : "s"}</p>
        <Link to="/advocate/availability/new">
          <Button className="rounded-full gap-1.5"><Plus className="h-4 w-4" /> Request Availability</Button>
        </Link>
      </div>

      <div role="tablist" aria-label="Filter requests" className="flex gap-2 flex-wrap mb-6">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.statuses ? rows.filter((r) => f.statuses!.includes(r.status)).length : rows.length;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className={`text-sm rounded-full px-3.5 py-1.5 transition-calm border ${
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-soft"
                  : "bg-card border-border text-primary-deep hover:border-primary/40"
              }`}
            >
              {f.label} <span className="opacity-70 ml-1">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <CalendarRange className="h-8 w-8 text-primary/60 mx-auto mb-3" />
          <p className="font-display text-lg text-primary-deep">No requests in this view</p>
          <p className="text-sm text-muted-foreground mt-1">Try a different filter or start a new request.</p>
          <Link to="/advocate/availability/new" className="inline-block mt-4">
            <Button className="rounded-full">Request Availability</Button>
          </Link>
        </div>
      ) : (
        <ul className="space-y-3 max-w-3xl">
          {filtered.map((r) => {
            const isReview = REVIEW_STATUSES.includes(r.status);
            const href = isReview ? `/advocate/availability/${r.id}/review` : `/advocate/availability/${r.id}/edit`;
            const action = isReview ? "View response" : "Edit";
            const isDraft = r.status === "draft";
            return (
              <li key={r.id} className="relative">
                <Link
                  to={href}
                  className="glass-card p-4 sm:p-5 flex items-center gap-4 hover:shadow-float hover:-translate-y-0.5 transition-calm group"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-primary-deep truncate">{r.clientName}</h3>
                      <span className={`text-xs rounded-full px-2.5 py-0.5 ${AVAILABILITY_STATUS_TONE[r.status] || "bg-secondary/60"}`}>
                        {AVAILABILITY_STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {r.appointment_category.replace(/_/g, " ")}
                      {r.appointment_purpose ? ` · ${r.appointment_purpose}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtShortDate(r.date_range_start)} → {fmtShortDate(r.date_range_end)}
                      {r.client_responded_at && (
                        <> · Client responded {new Date(r.client_responded_at).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-sm text-primary group-hover:translate-x-0.5 transition-calm">
                    {action} <ArrowRight className="h-4 w-4" />
                  </div>
                  {isDraft && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setToDelete({ id: r.id, name: r.clientName }); }}
                      className="rounded-full p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-calm"
                      aria-label="Delete draft"
                      title="Delete draft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `Remove the draft request for ${toDelete.name}. This can't be undone.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (e) => {
                e.preventDefault();
                if (!toDelete) return;
                setDeleting(true);
                const id = toDelete.id;
                const { error } = await supabase.from("availability_requests").delete().eq("id", id).eq("status", "draft");
                setDeleting(false);
                if (error) {
                  toast({ title: "Couldn't delete draft", description: error.message, variant: "destructive" });
                  return;
                }
                setRows((prev) => prev.filter((x) => x.id !== id));
                setToDelete(null);
                toast({ title: "Draft deleted" });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
