import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Inbox, MailPlus, UserPlus, Users, Hourglass, Building2,
  CalendarRange, DollarSign, AlertTriangle, MessageCircle,
  FileText, MessageSquareReply,
} from "lucide-react";

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

type Card = {
  key: keyof Counts;
  label: string;
  icon: typeof Inbox;
  href: string;
  tone: "primary" | "active" | "warning" | "overdue";
};

const ROWS: { title: string; cards: Card[] }[] = [
  {
    title: "Pipeline",
    cards: [
      { key: "new_enquiries", label: "New enquiries", icon: Inbox, href: "/advocate/messages#inbox-heading", tone: "primary" },
      { key: "invites_pending", label: "Invites pending", icon: MailPlus, href: "/advocate/clients?lifecycle=Invited", tone: "primary" },
      { key: "onboarding_incomplete", label: "Onboarding incomplete", icon: UserPlus, href: "/advocate/clients?lifecycle=Onboarding%20incomplete", tone: "primary" },
    ],
  },
  {
    title: "Active work",
    cards: [
      { key: "active_clients", label: "Active clients", icon: Users, href: "/advocate/clients?lifecycle=Active", tone: "active" },
      { key: "waiting_on_client", label: "Waiting on client", icon: Hourglass, href: "/advocate/clients?lifecycle=Waiting%20on%20client", tone: "active" },
      { key: "waiting_on_clinic", label: "Waiting on clinic", icon: Building2, href: "/advocate/clients?lifecycle=Waiting%20on%20clinic", tone: "active" },
    ],
  },
  {
    title: "Attention needed",
    cards: [
      { key: "appointments_this_week", label: "Appointments this week", icon: CalendarRange, href: "/advocate/calendar", tone: "warning" },
      { key: "payment_outstanding", label: "Payment outstanding", icon: DollarSign, href: "/advocate/clients?lifecycle=Payment%20outstanding", tone: "warning" },
      { key: "overdue_tasks", label: "Overdue tasks", icon: AlertTriangle, href: "/advocate/todo#overdue-section", tone: "overdue" },
      { key: "unread_messages", label: "Unread messages", icon: MessageCircle, href: "/advocate/messages", tone: "warning" },
    ],
  },
  {
    title: "Reports",
    cards: [
      { key: "reports_in_progress", label: "Reports in progress", icon: FileText, href: "/advocate/clients", tone: "primary" },
      { key: "feedback_to_review", label: "Feedback to review", icon: MessageSquareReply, href: "/advocate/clients", tone: "warning" },
    ],
  },
];

const TONE: Record<Card["tone"], { border: string; chip: string }> = {
  primary: { border: "border-l-primary", chip: "bg-primary/10 text-primary" },
  active: { border: "border-l-[hsl(var(--status-progress))]", chip: "bg-[hsl(var(--status-progress))]/10 text-[hsl(var(--status-progress))]" },
  warning: { border: "border-l-[hsl(var(--warning,30_90%_55%))]", chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  overdue: { border: "border-l-[hsl(var(--status-overdue))]", chip: "bg-[hsl(var(--status-overdue))]/10 text-[hsl(var(--status-overdue))]" },
};

export function DashboardCountCards() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="mb-10 space-y-6">
      {ROWS.map((row) => (
        <section key={row.title} aria-labelledby={`dash-${row.title}`}>
          <h2 id={`dash-${row.title}`} className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
            {row.title}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {row.cards.map((c) => {
              const tone = TONE[c.tone];
              const value = counts?.[c.key] ?? 0;
              return (
                <Link
                  key={c.key}
                  to={c.href}
                  className={`glass-card p-4 sm:p-5 border-l-4 ${tone.border} hover:shadow-float hover:-translate-y-0.5 transition-calm block min-h-[112px]`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`inline-flex h-9 w-9 rounded-xl items-center justify-center ${tone.chip}`}>
                      <c.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 font-display text-3xl text-primary-deep">
                    {loading ? <span className="inline-block h-7 w-10 rounded bg-secondary/60 animate-pulse" /> : value}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 leading-tight">{c.label}</div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
