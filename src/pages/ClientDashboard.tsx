import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { useAppointments } from "@/lib/appointments-store";
import { countdownLabel } from "@/lib/types";
import { useThoughts, relativeTime } from "@/lib/brain-dump-store";
import { useAuth } from "@/lib/auth";
import { ClientTasksPanel } from "@/components/ocean/ClientTasksPanel";
import { EmotionWaveCard } from "@/components/ocean/EmotionWaveCard";
import { ClientEngagementBar } from "@/components/ocean/ClientEngagementBar";
import { ClientReportsSection } from "@/components/ocean/ClientReportsSection";
import { CareJourneyTimeline } from "@/components/ocean/CareJourneyTimeline";
import { PaymentOutstandingNote } from "@/components/ocean/PaymentOutstandingNote";
import { useOwnClientProgress } from "@/lib/client-progress";
import { TodaysFocusCard } from "@/components/ocean/TodaysFocusCard";
import { countPendingForClient } from "@/lib/client-availability-store";
import { CalendarHeart, MessageCircle, Sparkles, Waves, ArrowRight, Heart, CalendarClock } from "lucide-react";

export default function ClientDashboard() {
  const { user } = useAuth();
  const firstName = ((user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "").split(/[ @]/)[0];
  const greeting = firstName ? `Hi ${firstName} 🌊` : "Hi there 🌊";

  const { appointments } = useAppointments(user?.id);
  const { thoughts } = useThoughts("client");
  const recentThought = thoughts[0];
  const { value: engagement } = useOwnClientProgress(user?.id);
  const [pendingAvail, setPendingAvail] = useState(0);
  useEffect(() => {
    let cancelled = false;
    countPendingForClient().then((n) => { if (!cancelled) setPendingAvail(n); });
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell role="client" title={greeting} subtitle="Take it one calm step at a time.">
      <PaymentOutstandingNote />
      {/* Today's focus — reads real to-dos for this user */}
      {user?.id && (
        <TodaysFocusCard userId={user.id} templateGroup="client" todoHref="/client/todo" />
      )}

      <div className="mb-6">
        <ClientEngagementBar
          value={engagement}
          variant="primary"
          title="Your progress"
          subtitle="A gentle snapshot of how you've been showing up. Every step counts."
        />
      </div>

      {pendingAvail > 0 && (
        <Link
          to="/client/availability"
          className="glass-card p-5 mb-6 flex items-center gap-4 hover:shadow-float hover:-translate-y-0.5 transition-calm group"
        >
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base text-primary-deep">Share Your Availability</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your advocate is asking when you could attend {pendingAvail === 1 ? "an appointment" : `${pendingAvail} appointments`}. This does not book anything yet.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-calm shrink-0" />
        </Link>
      )}


      {/* Quick access strip */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <Link to="/client/check-in" className="glass-card p-5 group transition-calm hover:shadow-soft hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center"><Heart className="h-5 w-5" /></div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-calm" />
          </div>
          <p className="font-display text-base text-primary-deep mt-3">Check in</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Share how you're feeling in one calm step.</p>
        </Link>

        <Link to="/client/messages" className="glass-card p-5 group transition-calm hover:shadow-soft hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><MessageCircle className="h-5 w-5" /></div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-calm" />
          </div>
          <p className="font-display text-base text-primary-deep mt-3">Messages</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Your advocate will reach out soon.</p>
        </Link>

        <Link to="/client/brain-dump" className="glass-card p-5 group transition-calm hover:shadow-soft hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center"><Waves className="h-5 w-5" /></div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-calm" />
          </div>
          <p className="font-display text-base text-primary-deep mt-3">Brain Dump</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {recentThought ? `"${recentThought.text}" · ${relativeTime(recentThought.createdAt)}` : "Drop in anything floating around."}
          </p>
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          {user?.id ? (
            <>
              <EmotionWaveCard clientId={user.id} viewerRole="client" />
              <ClientTasksPanel clientId={user.id} canManage={false} completedDisplay="hidden" />
              <CareJourneyTimeline clientId={user.id} />
              <ClientReportsSection clientId={user.id} viewerRole="client" />
            </>
          ) : (
            <div className="glass-card p-8 text-center text-muted-foreground">Loading…</div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarHeart className="h-4 w-4 text-accent" />
              <h3 className="font-display text-lg text-primary-deep">Coming up</h3>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments scheduled.</p>
            ) : (
              <div className="space-y-3">
                {appointments.map((a) => (
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
