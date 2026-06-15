import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, MapPin, Layers } from "lucide-react";
import { ClientColourKey, CLIENT_COLOURS } from "@/lib/types";

interface Appt {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
}

export function MiniUpcomingAppointments({
  clientId,
  clientColour,
}: {
  clientId: string;
  clientColour: ClientColourKey;
}) {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("appointments")
        .select("id, title, starts_at, location")
        .eq("client_id", clientId)
        .eq("outcome", "scheduled")
        .gte("starts_at", startOfToday.toISOString())
        .order("starts_at", { ascending: true })
        .limit(5);
      if (cancelled) return;
      setAppts(data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const colour = CLIENT_COLOURS[clientColour] ?? CLIENT_COLOURS.ocean;

  if (loading) {
    return (
      <section className="glass-card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg text-primary-deep">Coming up 🌊</h2>
        </div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (appts.length === 0) {
    return (
      <section className="glass-card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg text-primary-deep">Coming up 🌊</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No upcoming appointments — calm waters 🌊
        </p>
      </section>
    );
  }

  const today = new Date();
  today.setHours(1, 0, 0, 0);

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg text-primary-deep">Coming up 🌊</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {appts.length} upcoming
        </span>
      </div>

      <div className="space-y-3">
        {(() => {
          // Group same-time appointments into a clear stack
          const groups: Appt[][] = [];
          const idx = new Map<string, number>();
          appts.forEach((a) => {
            const k = a.starts_at;
            const i = idx.get(k);
            if (i === undefined) { idx.set(k, groups.length); groups.push([a]); }
            else { groups[i].push(a); }
          });

          const renderRow = (a: Appt) => {
            const d = new Date(a.starts_at);
            const isToday = d.toDateString() === new Date().toDateString();
            const datePart = isToday
              ? "Today"
              : d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
            const timePart = d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

            return (
              <Link
                key={a.id}
                to="/calendar"
                className="group flex items-start gap-3 rounded-2xl bg-secondary/40 p-3 transition-calm hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`${a.title} on ${datePart} at ${timePart}`}
              >
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colour.bg }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-primary-deep truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{datePart}, {timePart}</p>
                  {a.location && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3 opacity-60" />
                      <span className="truncate">{a.location}</span>
                    </p>
                  )}
                </div>
              </Link>
            );
          };

          return groups.map((group) => {
            if (group.length === 1) return renderRow(group[0]);
            return (
              <div
                key={group[0].starts_at}
                className="rounded-3xl bg-secondary/20 border-l-4 p-2.5 space-y-1.5"
                style={{ borderLeftColor: colour.bg }}
              >
                <div className="flex items-center gap-1.5 px-1 pt-0.5">
                  <Layers className="h-3 w-3 text-accent" />
                  <span className="text-[11px] text-muted-foreground">
                    {group.length} at the same time — both are separate
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.map(renderRow)}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </section>
  );
}
