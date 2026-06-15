import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Inbox, MailPlus, UserPlus, Users, Hourglass, Building2,
  CalendarRange, DollarSign, AlertTriangle, MessageCircle,
  FileText, MessageSquareReply, ChevronDown, ArrowRight,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Counts = {
  new_enquiries: number;
  invites_pending: number;
  onboarding_incomplete: number;
  active_clients: number;
  waiting_on_client: number;
  waiting_on_clinic: number;
  appointments_this_week: number;
  payment_outstanding: number;
  overdue_tasks: number;
  unread_messages: number;
  reports_in_progress: number;
  feedback_to_review: number;
};

type Metric = {
  key: keyof Counts;
  label: string;
  icon: typeof Inbox;
  href: string;
  tone: "primary" | "active" | "warning" | "overdue";
  group: "pipeline" | "active" | "reports";
};

// Items that demand attention today when > 0
const TODAY_KEYS: (keyof Counts)[] = [
  "new_enquiries",
  "overdue_tasks",
  "unread_messages",
  "payment_outstanding",
  "appointments_this_week",
];

const METRICS: Metric[] = [
  { key: "new_enquiries", label: "New enquiries", icon: Inbox, href: "/advocate/messages#inbox-heading", tone: "primary", group: "pipeline" },
  { key: "invites_pending", label: "Invites pending", icon: MailPlus, href: "/advocate/clients?lifecycle=Invited", tone: "primary", group: "pipeline" },
  { key: "onboarding_incomplete", label: "Onboarding incomplete", icon: UserPlus, href: "/advocate/clients?lifecycle=Onboarding%20incomplete", tone: "primary", group: "pipeline" },
  { key: "active_clients", label: "Active clients", icon: Users, href: "/advocate/clients?lifecycle=Active", tone: "active", group: "active" },
  { key: "waiting_on_client", label: "Waiting on client", icon: Hourglass, href: "/advocate/clients?lifecycle=Waiting%20on%20client", tone: "active", group: "active" },
  { key: "waiting_on_clinic", label: "Waiting on clinic", icon: Building2, href: "/advocate/clients?lifecycle=Waiting%20on%20clinic", tone: "active", group: "active" },
  { key: "appointments_this_week", label: "Appointments this week", icon: CalendarRange, href: "/advocate/calendar", tone: "warning", group: "active" },
  { key: "payment_outstanding", label: "Payment outstanding", icon: DollarSign, href: "/advocate/clients?lifecycle=Payment%20outstanding", tone: "warning", group: "active" },
  { key: "overdue_tasks", label: "Overdue tasks", icon: AlertTriangle, href: "/advocate/todo#overdue-section", tone: "overdue", group: "active" },
  { key: "unread_messages", label: "Unread messages", icon: MessageCircle, href: "/advocate/messages", tone: "warning", group: "active" },
  { key: "reports_in_progress", label: "Reports in progress", icon: FileText, href: "/advocate/clients", tone: "primary", group: "reports" },
  { key: "feedback_to_review", label: "Feedback to review", icon: MessageSquareReply, href: "/advocate/clients", tone: "warning", group: "reports" },
];

const TONE: Record<Metric["tone"], { border: string; chip: string }> = {
  primary: { border: "border-l-primary", chip: "bg-primary/10 text-primary" },
  active: { border: "border-l-[hsl(var(--status-progress))]", chip: "bg-[hsl(var(--status-progress))]/10 text-[hsl(var(--status-progress))]" },
  warning: { border: "border-l-[hsl(var(--warning,30_90%_55%))]", chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  overdue: { border: "border-l-[hsl(var(--status-overdue))]", chip: "bg-[hsl(var(--status-overdue))]/10 text-[hsl(var(--status-overdue))]" },
};

const GROUP_TITLES: Record<Metric["group"], string> = {
  pipeline: "Pipeline",
  active: "Active work",
  reports: "Reports",
};

export function DashboardCountCards() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_advocate_dashboard_counts");
      if (cancelled) return;
      if (!error && data) setCounts(data as unknown as Counts);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Build today's focus list — only non-zero actionable items
  const todayItems = TODAY_KEYS
    .map((k) => METRICS.find((m) => m.key === k)!)
    .filter((m) => (counts?.[m.key] ?? 0) > 0);

  return (
    <div className="mb-10 space-y-6">
      {/* TODAY — primary focus */}
      <section aria-labelledby="dash-today">
        <div className="flex items-baseline justify-between mb-4">
          <h2 id="dash-today" className="font-display text-2xl text-primary-deep">
            Today
          </h2>
          {!loading && todayItems.length > 0 && (
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {todayItems.length} {todayItems.length === 1 ? "thing" : "things"} to look at
            </span>
          )}
        </div>

        {loading ? (
          <div className="glass-card p-8 text-center">
            <span className="inline-block h-5 w-40 rounded bg-secondary/60 animate-pulse" />
          </div>
        ) : todayItems.length === 0 ? (
          <div className="glass-card p-8 text-center bg-gradient-card">
            <p className="font-display text-xl text-primary-deep">All clear 🌊</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Nothing needs your attention right now. Take it one task at a time — we've got the rest.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {todayItems.map((m) => {
              const tone = TONE[m.tone];
              const value = counts?.[m.key] ?? 0;
              return (
                <Link
                  key={m.key}
                  to={m.href}
                  className={`glass-card p-5 border-l-4 ${tone.border} hover:shadow-float hover:-translate-y-0.5 transition-calm block group`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`inline-flex h-10 w-10 rounded-2xl items-center justify-center ${tone.chip} shrink-0`}>
                      <m.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-3xl text-primary-deep leading-none">{value}</span>
                        <span className="text-sm text-primary-deep/80 truncate">{m.label}</span>
                      </div>
                    </div>
                    <ArrowRight className="hidden sm:block h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-calm shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* OVERVIEW — collapsible, lower contrast */}
      {!loading && counts && (
        <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
          <CollapsibleTrigger className="group flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-primary-deep transition-colors">
            <span>Overview</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${overviewOpen ? "rotate-180" : ""}`}
            />
            <span className="text-muted-foreground/70 normal-case tracking-normal">
              ({overviewOpen ? "hide" : "show all metrics"})
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-5">
            <OverviewGrid counts={counts} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function OverviewGrid({ counts }: { counts: Counts }) {
  const groups: Metric["group"][] = ["pipeline", "active", "reports"];

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const items = METRICS.filter((m) => m.group === group);
        const nonZero = items.filter((m) => (counts[m.key] ?? 0) > 0);
        const zero = items.filter((m) => (counts[m.key] ?? 0) === 0);

        return (
          <section key={group} aria-labelledby={`overview-${group}`}>
            <h3
              id={`overview-${group}`}
              className="text-xs uppercase tracking-wider text-muted-foreground/80 mb-3"
            >
              {GROUP_TITLES[group]}
            </h3>

            {nonZero.length === 0 && zero.length > 0 ? (
              <p className="text-sm text-muted-foreground/80 italic">
                Nothing here right now — {zero.map((z) => z.label.toLowerCase()).join(", ")}: 0.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {nonZero.map((m) => {
                    const tone = TONE[m.tone];
                    const value = counts[m.key] ?? 0;
                    return (
                      <Link
                        key={m.key}
                        to={m.href}
                        className={`rounded-2xl bg-card/60 border border-border/60 p-4 hover:bg-card hover:shadow-soft transition-calm block`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`inline-flex h-7 w-7 rounded-lg items-center justify-center ${tone.chip} shrink-0`}>
                            <m.icon className="h-3.5 w-3.5" />
                          </div>
                          <span className="font-display text-xl text-primary-deep/90 leading-none">{value}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 leading-tight">{m.label}</div>
                      </Link>
                    );
                  })}
                </div>
                {zero.length > 0 && (
                  <p className="text-xs text-muted-foreground/70 mt-3 leading-relaxed">
                    Quiet: {zero.map((z) => z.label.toLowerCase()).join(", ")}.
                  </p>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
