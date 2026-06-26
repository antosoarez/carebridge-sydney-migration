import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// CareBridge operates in Perth (AWST, UTC+8, no DST). We treat advocate
// availability times as Perth wall-clock and convert to UTC instants with a
// fixed +08:00 offset.
const AWST_OFFSET_MIN = 8 * 60;

export interface Slot {
  startUtc: string; // ISO
  endUtc: string;   // ISO
  label: string;    // e.g. "Wed 2 Jul, 10:00 am"
}

interface AvailabilityRow { day_of_week: number; start_time: string; end_time: string; }

function perthWallClockToUtc(year: number, month: number, day: number, minutes: number): Date {
  // minutes = minutes since midnight Perth time
  const h = Math.floor(minutes / 60), m = minutes % 60;
  // UTC instant = Perth wall clock - 8h
  return new Date(Date.UTC(year, month, day, h, m) - AWST_OFFSET_MIN * 60 * 1000);
}

function perthParts(d: Date) {
  // shift to Perth wall clock for display/day-of-week
  const p = new Date(d.getTime() + AWST_OFFSET_MIN * 60 * 1000);
  return { y: p.getUTCFullYear(), mo: p.getUTCMonth(), day: p.getUTCDate(), dow: p.getUTCDay(), h: p.getUTCHours(), mi: p.getUTCMinutes() };
}

function labelFor(startUtc: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    hour12: true, timeZone: "Australia/Perth",
  }).format(startUtc);
}

/** Generates bookable slots for the next `days` days from advocate availability,
 *  excluding any that overlap an existing scheduled appointment. */
export function useAvailableSlots(durationMin: number, days = 14) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: avail }, { data: appts }] = await Promise.all([
      supabase.from("advocate_availability").select("day_of_week, start_time, end_time").eq("active", true),
      supabase.from("appointments").select("starts_at, ends_at").eq("outcome", "scheduled").gte("starts_at", new Date().toISOString()),
    ]);
    const availability = (avail ?? []) as AvailabilityRow[];
    const busy = (appts ?? []).map((a) => [new Date(a.starts_at).getTime(), new Date(a.ends_at as string).getTime()] as const);
    const now = Date.now();
    const out: Slot[] = [];
    const toMin = (t: string) => { const [h, m] = t.split(":"); return Number(h) * 60 + Number(m); };

    for (let i = 0; i < days; i++) {
      const probe = new Date(now + i * 86400000);
      const { y, mo, day, dow } = perthParts(probe);
      for (const row of availability.filter((r) => r.day_of_week === dow)) {
        for (let mins = toMin(row.start_time); mins + durationMin <= toMin(row.end_time); mins += durationMin) {
          const start = perthWallClockToUtc(y, mo, day, mins);
          const end = new Date(start.getTime() + durationMin * 60000);
          if (start.getTime() <= now + 60 * 60 * 1000) continue; // need >1h lead time
          const overlaps = busy.some(([bs, be]) => start.getTime() < be && end.getTime() > bs);
          if (overlaps) continue;
          out.push({ startUtc: start.toISOString(), endUtc: end.toISOString(), label: labelFor(start) });
        }
      }
    }
    out.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    setSlots(out);
    setLoading(false);
  }, [durationMin, days]);

  useEffect(() => { reload(); }, [reload]);
  return { slots, loading, reload };
}

export function useBooking() {
  const { user } = useAuth();

  const book = useCallback(async (slot: Slot, opts: { category: "consultation" | "free_followup"; title: string }) => {
    if (!user?.id) return { error: "Not signed in" };
    const { error } = await supabase.from("appointments").insert({
      client_id: user.id,
      created_by: user.id,
      title: opts.title,
      starts_at: slot.startUtc,
      ends_at: slot.endUtc,
      category: opts.category,
      outcome: "scheduled",
    });
    return { error: error?.message ?? null };
  }, [user?.id]);

  return { book };
}
