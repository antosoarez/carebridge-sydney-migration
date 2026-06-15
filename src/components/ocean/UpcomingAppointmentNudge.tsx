import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarHeart, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UpcomingAppt {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
}

const SHOWN_KEY = "cb.upcomingAppt.shown.v1";

function readShown(): Set<string> {
  try {
    return new Set<string>(JSON.parse(sessionStorage.getItem(SHOWN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function writeShown(s: Set<string>) {
  sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...s]));
}

/** Soft, low-frequency two-note chime — same calm style as the check-in sound. */
function playCalmChime() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tones = [392, 523]; // G4 → C5, gentle major-ish
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.28;
      const end = start + 0.9;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2500);
  } catch {
    /* autoplay blocked — silently skip */
  }
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    day: "numeric",
    month: "short",
  });
}

/**
 * Calm in-app nudge for clients: when an appointment is starting within the
 * next ~4 hours and hasn't already been shown this session, surface a soft
 * card with a gentle chime. Skips appointments already marked attended,
 * rescheduled, or cancelled/missed.
 */
export function UpcomingAppointmentNudge() {
  const [appt, setAppt] = useState<UpcomingAppt | null>(null);

  const check = useCallback(async () => {
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id;
    if (!uid) return;
    const nowISO = new Date().toISOString();
    const in4h = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("appointments")
      .select("id, title, starts_at, location, outcome")
      .eq("client_id", uid)
      .eq("outcome", "scheduled")
      .gte("starts_at", nowISO)
      .lte("starts_at", in4h)
      .order("starts_at", { ascending: true })
      .limit(1);
    const next = (data ?? [])[0];
    if (!next) return;
    const shown = readShown();
    if (shown.has(next.id)) return;
    shown.add(next.id);
    writeShown(shown);
    setAppt({ id: next.id, title: next.title, starts_at: next.starts_at, location: next.location });
    playCalmChime();
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(check, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [check]);

  if (!appt) return null;

  return (
    <div className="fixed bottom-44 md:bottom-28 right-4 md:right-6 z-40 max-w-[22rem] animate-fade-in pointer-events-auto">
      <div className="glass-card p-5 shadow-soft border border-accent/20 bg-gradient-card relative">
        <button
          aria-label="Dismiss"
          onClick={() => setAppt(null)}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-calm"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 rounded-2xl bg-accent/15 text-accent flex items-center justify-center">
            <CalendarHeart className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base text-primary-deep">A calm reminder 🌊</p>
            <p className="text-sm text-foreground mt-1">{appt.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{whenLabel(appt.starts_at)}</p>
            {appt.location && (
              <p className="text-xs text-muted-foreground mt-0.5">{appt.location}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              You've got this. No rush — we're right here with you.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3 rounded-2xl"
              onClick={() => setAppt(null)}
            >
              Okay, thanks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
