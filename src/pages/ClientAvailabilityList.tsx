import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { CalendarClock, ArrowRight } from "lucide-react";
import {
  AVAILABILITY_STATUS_LABEL,
  AVAILABILITY_STATUS_TONE,
  fmtShortDate,
} from "@/lib/availability-store";
import { ClientRequestRow, listVisibleForClient } from "@/lib/client-availability-store";

export default function ClientAvailabilityList() {
  const [rows, setRows] = useState<ClientRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listVisibleForClient();
        if (!cancelled) setRows(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pending = rows.filter((r) => r.status === "sent_to_client" || r.status === "waiting_for_client");
  const shared = rows.filter((r) => r.status !== "sent_to_client" && r.status !== "waiting_for_client");

  return (
    <AppShell
      role="client"
      title="Share Your Availability"
      subtitle="Choose the times you could attend. This does not book the appointment yet."
    >
      <p className="text-sm text-muted-foreground max-w-2xl mb-6">
        Your advocate will use this to help arrange the appointment. You do not need to call the clinic yourself. You can choose more than one option.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : pending.length === 0 ? (
        <div className="glass-card p-8 text-center max-w-2xl">
          <CalendarClock className="h-8 w-8 text-primary/60 mx-auto mb-3" />
          <p className="font-display text-lg text-primary-deep">No availability requests right now.</p>
          <p className="text-sm text-muted-foreground mt-2">
            When your advocate needs your appointment availability, it will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3 max-w-2xl">
          {pending.map((r) => (
            <li key={r.id}>
              <Link
                to={`/client/availability/${r.id}`}
                className="glass-card p-5 flex items-center gap-4 hover:shadow-float hover:-translate-y-0.5 transition-calm group"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-primary-deep">
                      {r.appointment_category.replace(/_/g, " ")}
                    </h3>
                    <span className={`text-xs rounded-full px-2.5 py-0.5 ${AVAILABILITY_STATUS_TONE[r.status] || "bg-secondary/60"}`}>
                      {AVAILABILITY_STATUS_LABEL[r.status]}
                    </span>
                    {r.urgency !== "flexible" && (
                      <span className="text-xs rounded-full px-2.5 py-0.5 bg-accent/15 text-primary-deep capitalize">
                        {r.urgency}
                      </span>
                    )}
                  </div>
                  {r.appointment_purpose && (
                    <p className="text-sm text-primary-deep/80">{r.appointment_purpose}</p>
                  )}
                  {(r.provider_name || r.clinic_name) && (
                    <p className="text-sm text-muted-foreground">
                      {[r.provider_name, r.clinic_name].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {fmtShortDate(r.date_range_start)} → {fmtShortDate(r.date_range_end)}
                  </p>
                  <Button size="sm" className="rounded-full mt-2 gap-1.5" tabIndex={-1}>
                    Share availability <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {shared.length > 0 && (
        <div className="mt-10 max-w-2xl">
          <h2 className="font-display text-lg text-primary-deep mb-3">Already shared</h2>
          <ul className="space-y-2">
            {shared.map((r) => (
              <li key={r.id} className="glass-card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary-deep truncate">
                    {r.appointment_category.replace(/_/g, " ")}
                    {r.appointment_purpose ? ` — ${r.appointment_purpose}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtShortDate(r.date_range_start)} → {fmtShortDate(r.date_range_end)}
                  </p>
                </div>
                <span className={`text-xs rounded-full px-2.5 py-0.5 ${AVAILABILITY_STATUS_TONE[r.status] || "bg-secondary/60"}`}>
                  {AVAILABILITY_STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
