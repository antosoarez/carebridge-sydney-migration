import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Plays a soft two-note chime (same shape as message chime). Safe if blocked.
function playChime() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      const end = start + 0.35;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* autoplay may block before first user gesture — silent */ }
}

const FIRED_KEY = "carebridge.reminders.fired.v1";
function loadFired(): Record<string, true> {
  try { return JSON.parse(sessionStorage.getItem(FIRED_KEY) || "{}"); } catch { return {}; }
}
function markFired(key: string) {
  const f = loadFired();
  f[key] = true;
  try { sessionStorage.setItem(FIRED_KEY, JSON.stringify(f)); } catch {}
}

/**
 * Watches the current user's tasks for reminder_at timestamps and schedules
 * a gentle in-app chime + toast when each reminder is due. Reminders within
 * the past hour also fire once (catches tabs reopened just after the time).
 */
export function useReminderScheduler(userId?: string) {
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const clearTimers = () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current = [];
    };

    const fire = (key: string, title: string) => {
      if (loadFired()[key]) return;
      markFired(key);
      playChime();
      toast(title, {
        description: "A gentle reminder — open To-do when you're ready.",
        duration: 8000,
      });
    };

    const load = async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, reminder_at, status")
        .eq("client_id", userId)
        .eq("status", "to_do")
        .not("reminder_at", "is", null);
      if (cancelled || !data) return;
      clearTimers();
      const now = Date.now();
      const horizon = now + 1000 * 60 * 60 * 6; // schedule up to 6 hours ahead
      const fired = loadFired();
      data.forEach((t: any) => {
        if (!t.reminder_at) return;
        const at = new Date(t.reminder_at).getTime();
        const key = `${t.id}:${t.reminder_at}`;
        if (fired[key]) return;
        // Within the past hour → fire immediately (once)
        if (at <= now && now - at < 60 * 60 * 1000) {
          fire(key, `Reminder: ${t.title}`);
          return;
        }
        if (at > now && at <= horizon) {
          const id = window.setTimeout(
            () => fire(key, `Reminder: ${t.title}`),
            Math.max(0, at - now),
          );
          timersRef.current.push(id);
        }
      });
    };

    load();
    // Re-evaluate on any task change for this user
    const channel = supabase
      .channel(`reminders-rt-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `client_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    // Re-check on focus and every 5 minutes (covers long-running tabs)
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(load, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearTimers();
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
