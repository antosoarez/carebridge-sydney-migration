import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { useAvailableSlots, useBooking, type Slot } from "@/lib/booking-store";
import { CalendarClock, Check, Loader2, Video } from "lucide-react";
import { toast } from "sonner";

interface Props {
  mode: "consultation" | "followup";
}

const CONFIG = {
  consultation: {
    duration: 60,
    title: "Book your consultation",
    subtitle: "Choose a time for your 1-hour consultation.",
    apptTitle: "CareBridge consultation",
    category: "consultation" as const,
    nextHref: "/client/intake-form",
    nextLabel: "Continue to your health intake",
  },
  followup: {
    duration: 30,
    title: "Book your free follow-up",
    subtitle: "Choose a time for your free 30-minute follow-up call.",
    apptTitle: "CareBridge follow-up call",
    category: "free_followup" as const,
    nextHref: "/client",
    nextLabel: "Back to my dashboard",
  },
};

export default function BookAppointment({ mode }: Props) {
  const cfg = CONFIG[mode];
  const navigate = useNavigate();
  const { slots, loading } = useAvailableSlots(cfg.duration);
  const { book } = useBooking();
  const [selected, setSelected] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState(false);

  // Group slots by Perth calendar day for display.
  const grouped = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const day = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Perth" }).format(new Date(s.startUtc));
      const time = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Perth" }).format(new Date(s.startUtc));
      const arr = map.get(day) ?? [];
      arr.push({ ...s, label: time });
      map.set(day, arr);
    }
    return Array.from(map.entries());
  }, [slots]);

  const confirm = async () => {
    if (!selected) return;
    setBooking(true);
    const { error } = await book(selected, { category: cfg.category, title: cfg.apptTitle });
    setBooking(false);
    if (error) { toast.error("Couldn't book that time — please try another."); return; }
    setDone(true);
    toast.success("Booked! A confirmation is on its way.");
  };

  return (
    <AppShell role="client" title={cfg.title} subtitle={cfg.subtitle}>
      {done ? (
        <div className="glass-card p-10 text-center max-w-lg mx-auto animate-fade-in">
          <div className="mx-auto h-16 w-16 rounded-full bg-success/15 flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h2 className="font-display text-2xl text-primary-deep">You're booked 🌊</h2>
          <p className="text-muted-foreground mt-2">
            {selected?.label ? "Your time is confirmed. " : ""}We've sent a confirmation and your advocate has been notified.
          </p>
          <Button onClick={() => navigate(cfg.nextHref)} className="mt-6 rounded-2xl h-12 px-6 bg-gradient-ocean shadow-soft">
            {cfg.nextLabel}
          </Button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          <div className="glass-card p-4 mb-6 flex items-center gap-3 bg-secondary/30">
            <Video className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              This is a {cfg.duration}-minute video appointment. You'll get a link in your confirmation and calendar.
            </p>
          </div>

          {loading ? (
            <div className="glass-card p-10 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Finding available times…
            </div>
          ) : slots.length === 0 ? (
            <div className="glass-card p-10 text-center text-muted-foreground">
              No times are available right now. Please check back soon or message your advocate.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([day, daySlots]) => (
                <div key={day}>
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-base text-primary-deep">{day}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map((s) => {
                      const active = selected?.startUtc === s.startUtc;
                      return (
                        <button
                          key={s.startUtc}
                          onClick={() => setSelected(s)}
                          className={`min-h-12 rounded-2xl px-4 py-2 text-sm font-medium transition-calm border-2 ${
                            active ? "border-primary bg-primary/10 text-primary-deep shadow-soft" : "border-transparent bg-secondary/40 hover:bg-secondary/70"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="sticky bottom-4 pt-2">
                <Button
                  onClick={confirm}
                  disabled={!selected || booking}
                  className="w-full rounded-2xl h-13 py-3 bg-gradient-ocean shadow-float text-base gap-2"
                >
                  {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {selected ? `Book ${selected.label}` : "Pick a time above"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
