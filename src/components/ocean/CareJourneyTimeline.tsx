import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Clock,
  CalendarHeart,
  FileText,
  Sparkles,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
} from "lucide-react";

type Kind = "appointment" | "document" | "report";

const DONE_PHRASES = [
  "One less thing 🌊",
  "Step complete.",
  "You're moving forward.",
  "This one is done.",
  "Another small win.",
];
function donePhrase(seed: string): string {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DONE_PHRASES[h % DONE_PHRASES.length];
}

interface Milestone {
  id: string;
  kind: Kind;
  title: string;
  detail?: string | null;
  date: string; // ISO
  done: boolean;
  upcoming: boolean;
  note?: string | null;
  bucket?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
}

function gentleDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days <= 7) return `In ${days} days`;
  if (days < -1 && days >= -7) return `${Math.abs(days)} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function appointmentCopy(title: string, outcome: string, upcoming: boolean): string {
  const t = (title ?? "").trim() || "Appointment";
  if (outcome === "attended") return `${t} — completed 🌊`;
  if (outcome === "rescheduled") return `${t} — gently rescheduled`;
  if (outcome === "cancelled_missed") return `${t} — we'll find a new time when you're ready`;
  return upcoming ? `${t} — coming up soon` : t;
}

function fmtBytes(b?: number | null): string | null {
  if (!b || b <= 0) return null;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

async function openSigned(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function CareJourneyTimeline({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Track which milestones have already played their checkmark animation this session
  const playedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [appts, docs, reports] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, title, starts_at, location, outcome, notes")
          .eq("client_id", clientId),
        supabase
          .from("documents")
          .select("id, name, created_at, mime_type, size_bytes, storage_path, uploaded_by, visibility")
          .eq("client_id", clientId),
        supabase
          .from("reports")
          .select("id, title, shared_at, client_agreed_at, visibility, storage_path, file_name, size_bytes, created_at")
          .eq("client_id", clientId)
          .eq("visibility", "shared"),
      ]);
      if (cancelled) return;

      const now = Date.now();
      const list: Milestone[] = [];

      (appts.data ?? []).forEach((a: any) => {
        const date = a.starts_at as string;
        const upcoming = a.outcome === "scheduled" && new Date(date).getTime() >= now;
        const done = a.outcome === "attended";
        list.push({
          id: `appt-${a.id}`,
          kind: "appointment",
          title: appointmentCopy(a.title, a.outcome, upcoming),
          detail: a.location ?? null,
          date,
          done,
          upcoming,
          note: a.notes ?? null,
        });
      });

      // Tasks intentionally excluded from the Care Journey timeline.
      // Only clinical milestones (appointments, documents, reports) appear here.
      // Task events still live in task_status_events for engagement/audit purposes.





      (docs.data ?? []).forEach((d: any) => {
        const fromClient = d.uploaded_by === clientId;
        list.push({
          id: `doc-${d.id}`,
          kind: "document",
          title: fromClient
            ? `${d.name} — received, thank you`
            : `New document shared with you: ${d.name}`,
          detail: d.mime_type ?? null,
          date: d.created_at,
          done: true,
          upcoming: false,
          bucket: "client-documents",
          storagePath: d.visibility === "shared" ? d.storage_path : null,
          fileName: d.name,
          sizeBytes: d.size_bytes,
        });
      });

      (reports.data ?? []).forEach((r: any) => {
        if (r.shared_at) {
          list.push({
            id: `report-shared-${r.id}`,
            kind: "report",
            title: `${r.title} — ready to read together 🌊`,
            date: r.shared_at,
            done: true,
            upcoming: false,
            bucket: "client-documents",
            storagePath: r.storage_path,
            fileName: r.file_name,
            sizeBytes: r.size_bytes,
          });
        }
        if (r.client_agreed_at) {
          list.push({
            id: `report-agreed-${r.id}`,
            kind: "report",
            title: `${r.title} — agreed, well done`,
            date: r.client_agreed_at,
            done: true,
            upcoming: false,
          });
        }
      });

      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setItems(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const completedCount = useMemo(() => items.filter((i) => i.done).length, [items]);

  if (loading) {
    return (
      <section className="glass-card p-6">
        <h2 className="font-display text-xl text-primary-deep">Your Care Journey 🌊</h2>
        <p className="text-sm text-muted-foreground mt-2">Gathering your steps…</p>
      </section>
    );
  }

  return (
    <section className="glass-card p-6 md:p-7" aria-labelledby="care-journey-heading">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-2xl bg-gradient-ocean text-primary-foreground flex items-center justify-center shadow-soft shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 id="care-journey-heading" className="font-display text-xl md:text-2xl text-primary-deep">
            Your Care Journey 🌊
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            A gentle map of what you've done and what's gently ahead.{" "}
            {completedCount > 0 && (
              <span className="text-primary font-semibold">
                {completedCount} step{completedCount === 1 ? "" : "s"} completed — well done.
              </span>
            )}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-secondary/40 p-8 text-center">
          <p className="text-sm text-primary-deep">Your journey starts here 🌱</p>
          <p className="text-xs text-muted-foreground mt-1">As things happen, milestones will land here.</p>
        </div>
      ) : (
        <ol className="relative pl-7 sm:pl-8 space-y-3">
          <span
            aria-hidden="true"
            className="absolute left-[11px] sm:left-3 top-2 bottom-2 w-px bg-gradient-to-b from-primary/20 via-accent/20 to-transparent"
          />
          {items.map((m) => {
            const Icon =
              m.kind === "appointment" ? CalendarHeart :
              m.kind === "document" ? FileText :
              m.kind === "report" ? ClipboardCheck :
              m.done ? Sparkles : Clock;
            const dotStyle = m.done
              ? "bg-primary text-primary-foreground"
              : m.upcoming
              ? "bg-accent/20 text-accent ring-2 ring-accent/30"
              : "bg-secondary text-muted-foreground";
            const isOpen = !!expanded[m.id];
            const hasFile = !!(m.storagePath && m.bucket);
            const hasDetail = !!(m.detail || m.note || hasFile);
            const shouldDraw = m.done && !playedRef.current.has(m.id);
            if (shouldDraw) playedRef.current.add(m.id);

            return (
              <li key={m.id} className="relative">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -left-7 sm:-left-8 top-3 h-6 w-6 rounded-full flex items-center justify-center shadow-soft",
                    dotStyle,
                  )}
                >
                  {m.done ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="5 12 10 17 19 7" className={shouldDraw ? "animate-check-draw" : ""} />
                    </svg>
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => hasDetail && setExpanded((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  className={cn(
                    "w-full text-left rounded-2xl px-4 py-3.5 transition-calm min-h-[56px]",
                    "bg-secondary/40 hover:bg-secondary/60 active:bg-secondary/70",
                    m.done && "bg-primary/5 hover:bg-primary/10",
                    m.upcoming && "ring-1 ring-accent/20",
                    !hasDetail && "cursor-default hover:bg-secondary/40",
                  )}
                  aria-expanded={hasDetail ? isOpen : undefined}
                  disabled={!hasDetail}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                    <p className="text-sm font-semibold text-primary-deep text-balance">{m.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{gentleDate(m.date)}</span>
                      {hasDetail && (
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-300",
                            isOpen && "rotate-180",
                          )}
                        />
                      )}
                    </div>
                  </div>
                  {isOpen && hasDetail && (
                    <div className="mt-3 pt-3 border-t border-border/50 space-y-2 animate-fade-in">
                      {m.detail && <p className="text-xs text-muted-foreground">{m.detail}</p>}
                      {m.note && (
                        <p className="text-xs text-primary-deep/80 bg-background/60 rounded-xl p-2.5">
                          <span className="font-semibold">Advocate note:</span> {m.note}
                        </p>
                      )}
                      {hasFile && (
                        <div className="flex items-center justify-between gap-3 bg-background/60 rounded-xl px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-primary-deep truncate">{m.fileName ?? "Open file"}</p>
                            {fmtBytes(m.sizeBytes) && (
                              <p className="text-[11px] text-muted-foreground">{fmtBytes(m.sizeBytes)}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openSigned(m.bucket!, m.storagePath!); }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-deep transition-calm shrink-0"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <p className="text-[11px] text-muted-foreground/80 mt-5 text-center">
        We'll take this one step at a time 💙
      </p>
    </section>
  );
}
