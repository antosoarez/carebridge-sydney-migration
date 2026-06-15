import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { calculateUrgency, topSignal, urgencyBadgeClasses, UrgencyLevel, UrgencySignal } from "@/lib/urgency";
import { AlertCircle, ArrowRight, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TriageRow {
  clientId: string;
  name: string;
  score: number;
  level: UrgencyLevel;
  top: UrgencySignal | null;
  nextAction: string | null;
  nextDue: string | null;
}

function dueLabel(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const days = Math.round(diffMs / 86400000);
  if (diffMs < 0) return { text: `Overdue ${Math.abs(days)}d`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due tomorrow", overdue: false };
  return { text: `Due in ${days}d`, overdue: false };
}

export function TriageSection() {
  const [rows, setRows] = useState<TriageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email, urgency_score, urgency_level, lifecycle_status")
        .in("id", ids)
        .neq("urgency_level", "Stable")
        .order("urgency_score", { ascending: false })
        .limit(8);

      const active = (profiles ?? []).filter((p: any) =>
        !p.lifecycle_status || !["Completed", "Inactive"].includes(p.lifecycle_status),
      );
      if (active.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

      const { data: cases } = await supabase
        .from("client_cases")
        .select("client_id, next_action, next_action_due_at, case_status, opened_at")
        .in("client_id", active.map((p: any) => p.id))
        .not("case_status", "in", "(Completed,Closed)")
        .order("opened_at", { ascending: false });

      const caseByClient = new Map<string, any>();
      for (const c of cases ?? []) {
        if (!caseByClient.has(c.client_id)) caseByClient.set(c.client_id, c);
      }

      const results = await Promise.all(
        active.map(async (p: any) => {
          const r = await calculateUrgency(p.id);
          const c = caseByClient.get(p.id);
          return {
            clientId: p.id,
            name: (p.full_name?.trim() || p.email || "Unnamed client") as string,
            score: r?.score ?? p.urgency_score ?? 0,
            level: (r?.level ?? p.urgency_level ?? "Stable") as UrgencyLevel,
            top: r ? topSignal(r.signals) : null,
            nextAction: c?.next_action ?? null,
            nextDue: c?.next_action_due_at ?? null,
          } as TriageRow;
        }),
      );

      if (cancelled) return;
      results.sort((a, b) => b.score - a.score);
      setRows(results.filter((r) => r.level !== "Stable"));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section aria-labelledby="triage-heading" className="glass-card p-5 sm:p-6 mb-6 bg-gradient-card">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-5 w-5 text-primary" strokeWidth={1.75} />
        <h2 id="triage-heading" className="font-display text-lg text-primary-deep">Needs attention</h2>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking on your clients…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">All clients are on track ✓</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.slice(0, 5).map((r) => {
            const due = dueLabel(r.nextDue);
            return (
              <li key={r.clientId}>
                <Link
                  to={`/advocate/client/${r.clientId}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl bg-white/70 hover:bg-white px-4 py-3 transition-colors group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold shrink-0",
                        urgencyBadgeClasses(r.level),
                      )}
                    >
                      {r.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-primary-deep truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.top ? r.top.label : "Needs review"}
                      </p>
                    </div>
                  </div>

                  {(r.nextAction || due) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground sm:max-w-[45%] min-w-0">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{r.nextAction ?? "—"}</span>
                      {due && (
                        <span className={cn("ml-1 shrink-0 font-medium", due.overdue ? "text-destructive" : "")}>
                          {due.text}
                        </span>
                      )}
                    </div>
                  )}
                  <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
