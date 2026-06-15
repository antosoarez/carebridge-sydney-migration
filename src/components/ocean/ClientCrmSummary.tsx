import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CalendarRange, MessageCircle, FileText, DollarSign, Briefcase, Smile, Frown, Meh } from "lucide-react";

type Summary = {
  active_case: { id: string; title: string; status: string; next_action: string | null; next_action_due_at: string | null; payment_state: string | null } | null;
  payment_state: string | null;
  report_status: string | null;
  last_message_at: string | null;
  last_document_at: string | null;
  next_appointment: { id: string; title: string; starts_at: string; location: string | null } | null;
  recent_moods: { emotion: string; created_at: string }[];
  active_signals: { signal_type: string }[];
  internal_notes_preview: string | null;
};

const MOOD_EMOJI: Record<string, string> = {
  happy: "😊", calm: "🙂", ok: "🙂", neutral: "😐",
  tired: "😴", anxious: "😟", overwhelmed: "😖", sad: "😢", angry: "😠",
};

const SIGNAL_LABEL: Record<string, string> = {
  unread_messages_24h: "Unread 24h+",
  low_mood_streak: "Low-mood streak",
  payment_overdue: "Payment overdue",
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"} ago`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}h ago`;
  return "just now";
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function ClientCrmSummary({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error } = await supabase.rpc("get_client_crm_summary", { p_client_id: clientId });
      if (cancelled) return;
      if (!error && row) setData(row as unknown as Summary);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) {
    return <div className="glass-card p-5 mb-6 animate-pulse h-32 bg-secondary/30" />;
  }
  if (!data) return null;

  const moodIcon = (m: string) => MOOD_EMOJI[m] ?? "•";

  return (
    <section aria-label="Client CRM summary" className="glass-card p-5 sm:p-6 mb-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Current state */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Current</h3>
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Briefcase className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                {data.active_case ? (
                  <>
                    <p className="font-semibold text-primary-deep truncate">{data.active_case.title}</p>
                    <p className="text-xs text-muted-foreground">{data.active_case.status}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">No open cases</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-primary-deep">{data.payment_state ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-primary-deep capitalize">{data.report_status ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* Activity */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Activity</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Last message:</span>
              <span className="text-primary-deep">{relTime(data.last_message_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Last document:</span>
              <span className="text-primary-deep">{relTime(data.last_document_at)}</span>
            </div>
            <div className="flex items-start gap-2">
              <CalendarRange className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                {data.next_appointment ? (
                  <>
                    <span className="text-primary-deep font-medium">{shortDate(data.next_appointment.starts_at)}</span>
                    <span className="text-muted-foreground"> — {data.next_appointment.title}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No upcoming appointment</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mood + signals */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Recent mood</h3>
          <div className="flex items-center gap-2 text-2xl mb-3" aria-label="Last 3 mood check-ins">
            {data.recent_moods.length === 0 ? (
              <span className="text-sm text-muted-foreground">No check-ins yet</span>
            ) : (
              data.recent_moods.map((m, i) => (
                <span key={i} title={`${m.emotion} · ${relTime(m.created_at)}`}>{moodIcon(m.emotion)}</span>
              ))
            )}
          </div>
          {data.active_signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.active_signals.map((s, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-secondary/70 text-muted-foreground">
                  {SIGNAL_LABEL[s.signal_type] ?? s.signal_type}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {data.internal_notes_preview && (
        <Link to="#internal-notes" className="mt-4 block text-xs text-muted-foreground italic border-t pt-3 hover:text-primary-deep transition-colors">
          Note: {data.internal_notes_preview}
        </Link>
      )}
    </section>
  );
}
