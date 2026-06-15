import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { ClientAvatar } from "@/components/ocean/ClientAvatar";
import { useClients } from "@/lib/clients-store";
import { useAppointments } from "@/lib/appointments-store";
import { countdownLabel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowRight, CalendarRange, Heart, MessageCircle, Plus, Sparkles, Wand2 } from "lucide-react";
import { PendingDocumentsBanner } from "@/components/ocean/PendingDocumentsBanner";
import { InviteClientDialog } from "@/components/ocean/InviteClientDialog";
import { supabase } from "@/integrations/supabase/client";
import { computeLowMoodFlags } from "@/lib/low-mood-flag";
import { useAuth } from "@/lib/auth";
import { TodaysFocusCard } from "@/components/ocean/TodaysFocusCard";
import { TriageSection } from "@/components/ocean/TriageSection";
import { DashboardCountCards } from "@/components/ocean/DashboardCountCards";

type FlaggedClient = { userId: string; name: string; streak: number; lastDate: string };
type UnreadSignal = { id: string; clientId: string; threadId: string | null; name: string };

export default function AdvocateDashboard() {
  const { clients } = useClients();
  const { appointments } = useAppointments();
  const { user } = useAuth();
  const advocateName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? "";

  const [overdueCount, setOverdueCount] = useState(0);
  const [autoCount, setAutoCount] = useState(0);


  const [flagged, setFlagged] = useState<FlaggedClient[]>([]);
  const [unreadSignals, setUnreadSignals] = useState<UnreadSignal[]>([]);

  const loadSignals = useCallback(async () => {
    const { data: rows } = await supabase
      .from("attention_signals")
      .select("id, client_id, thread_id, signal_type")
      .is("auto_resolved_at", null)
      .is("noted_at", null)
      .eq("signal_type", "unread_messages_24h");
    if (!rows || rows.length === 0) { setUnreadSignals([]); return; }
    const ids = Array.from(new Set(rows.map((r: any) => r.client_id)));
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    setUnreadSignals(rows.map((r: any) => {
      const p: any = map.get(r.client_id);
      return {
        id: r.id,
        clientId: r.client_id,
        threadId: r.thread_id,
        name: p?.full_name?.trim() || p?.email || "Unknown client",
      };
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Note-free RPC — advocates can see the pattern but never the optional notes.
      const { data: logs } = await supabase.rpc("get_recent_low_mood_rows", { _days: 7 });
      if (!logs || cancelled) { setFlagged([]); }
      else {
        const flags = computeLowMoodFlags(logs as any);
        if (flags.size === 0) { setFlagged([]); }
        else {
          const ids = Array.from(flags.keys());
          const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
          if (cancelled) return;
          const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
          const list: FlaggedClient[] = ids.map((id) => {
            const f = flags.get(id)!;
            const p = profileMap.get(id);
            return { userId: id, name: p?.full_name?.trim() || p?.email || "Unknown client", streak: f.streak, lastDate: f.lastDate };
          });
          list.sort((a, b) => b.streak - a.streak || b.lastDate.localeCompare(a.lastDate));
          setFlagged(list);
        }
      }
      if (!cancelled) await loadSignals();

      // Overdue tasks count (advocate's own to-dos past due date)
      if (user?.id && !cancelled) {
        const today = new Date().toISOString().slice(0, 10);
        const { count } = await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("client_id", user.id)
          .neq("status", "complete")
          .lt("due_date", today);
        if (!cancelled) setOverdueCount(count ?? 0);
      }

      // Auto-generated open tasks (any client, advocate-visible via RLS)
      if (!cancelled) {
        const { count } = await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .neq("status", "complete")
          .not("auto_dedup_key", "is", null);
        if (!cancelled) setAutoCount(count ?? 0);
      }
    })();
    return () => { cancelled = true; };
  }, [loadSignals, user?.id]);

  const handleMarkNoted = async (signalId: string) => {
    // Optimistic removal
    setUnreadSignals((prev) => prev.filter((s) => s.id !== signalId));
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id;
    const { error } = await supabase
      .from("attention_signals")
      .update({ noted_at: new Date().toISOString(), noted_by: uid ?? null })
      .eq("id", signalId);
    if (error) {
      console.error("mark as noted failed", error);
      // Refetch to restore correct state
      loadSignals();
    }
  };

  const hasAnySignal = flagged.length > 0 || unreadSignals.length > 0;

  return (
    <AppShell role="advocate" title={advocateName ? `Good morning, ${advocateName}` : "Good morning"} subtitle="Here's a calm overview of your clients today.">
      <TriageSection />
      <DashboardCountCards />
      <PendingDocumentsBanner />

      {/* Today's focus — pulls the advocate's own work to-dos */}
      {user?.id && (
        <TodaysFocusCard userId={user.id} templateGroup="advocate" todoHref="/advocate/todo" />
      )}

      {/* SAFETY INVARIANT — see prior comments. Private advocate nudge only; never coupled with crisis resources. */}
      {hasAnySignal && (
        <section aria-labelledby="needs-attention-heading" className="mb-8 rounded-3xl bg-[#f1f5ef] border border-[#cdddc9] p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="h-5 w-5 text-[#8BA888]" strokeWidth={1.75} />
            <h2 id="needs-attention-heading" className="font-display text-lg text-[#1C2B3A]">Needs attention</h2>
          </div>
          <ul className="space-y-2.5">
            {flagged.map((f) => (
              <li key={f.userId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl bg-white/70 px-4 py-3">
                <p className="text-sm text-[#1C2B3A] leading-snug">
                  <span className="font-semibold">{f.name}</span>{" "}
                  <span className="text-[#5b6b60]">— low-mood check-ins on <span className="font-medium text-[#8BA888]">{f.streak} days in a row</span> (most recent {f.lastDate}).</span>
                </p>
                <Link to="/advocate/clients" className="self-start sm:self-auto text-sm font-medium text-[#1C2B3A] hover:underline whitespace-nowrap">Open check-ins →</Link>
              </li>
            ))}
            {unreadSignals.map((s) => (
              <li key={s.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
                <p className="text-sm text-[#1C2B3A] leading-snug flex-1 min-w-0">
                  <MessageCircle className="inline h-4 w-4 mr-1.5 text-[#8BA888] -mt-0.5" strokeWidth={1.75} />
                  <span className="font-semibold">{s.name}</span>{" "}
                  <span className="text-[#5b6b60]">hasn't read messages in 24+ hours — a gentle personal nudge might help.</span>
                </p>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  {s.threadId && (
                    <Link
                      to={`/advocate/messages/${s.threadId}`}
                      className="text-sm font-medium text-[#1C2B3A] hover:underline whitespace-nowrap"
                    >
                      Open messages →
                    </Link>
                  )}
                  <button
                    onClick={() => handleMarkNoted(s.id)}
                    className="text-xs font-medium text-[#5b6b60] hover:text-[#1C2B3A] rounded-full px-3 py-1.5 hover:bg-[#cdddc9]/40 transition-colors whitespace-nowrap"
                  >
                    Mark as noted
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        to="/advocate/availability"
        className="glass-card p-5 mb-8 flex items-center gap-4 hover:shadow-float hover:-translate-y-0.5 transition-calm group bg-gradient-card"
      >
        <div className="inline-flex h-12 w-12 rounded-2xl items-center justify-center bg-primary/10 text-primary shrink-0">
          <CalendarRange className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg text-primary-deep">Request Availability</h2>
          <p className="text-sm text-muted-foreground">Ask a client when they could attend an appointment, without back-and-forth.</p>
        </div>
        <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-calm" />
      </Link>

      {autoCount > 0 && (
        <p className="text-xs text-muted-foreground mb-10 flex items-center gap-1.5">
          <Wand2 className="h-3.5 w-3.5 text-accent" />
          {autoCount} auto-generated {autoCount === 1 ? "task is" : "tasks are"} open in the background.
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl text-primary-deep">Your clients</h2>
            <InviteClientDialog
              trigger={
                <Button variant="ghost" className="rounded-full text-primary gap-1 hover:bg-primary/10">
                  <Plus className="h-4 w-4" /> New case
                </Button>
              }
            />
          </div>
          {clients.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">
              <p className="font-display text-base text-primary-deep">No clients yet</p>
              <p className="text-sm mt-1">Your dashboard will come alive once your first client is onboard.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((c) => (
                <Link key={c.id} to={`/advocate/client/${c.id}`} className="glass-card p-5 flex items-center gap-4 hover:shadow-float hover:-translate-y-0.5 transition-calm group">
                  <ClientAvatar name={c.name} gradient={c.avatarColor} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{c.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{c.email}</p>
                  </div>
                  <ArrowRight className="hidden md:block h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-calm" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="font-display text-lg text-primary-deep">Activity timeline</h3>
            </div>
            <p className="text-sm text-muted-foreground">Activity will appear here.</p>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-display text-lg text-primary-deep mb-4">Upcoming appointments</h3>
            {appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments scheduled.</p>
            ) : (
              <div className="space-y-3">
                {appointments.slice(0, 4).map((a) => (
                  <div key={a.id} className="p-3 rounded-2xl bg-secondary/50">
                    <p className="font-semibold text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{countdownLabel(a.date)}</p>
                    {a.location && <p className="text-xs text-muted-foreground">{a.location}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
