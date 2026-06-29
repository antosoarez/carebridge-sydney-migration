import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const DAYS = [
  { dow: 1, label: "Monday" }, { dow: 2, label: "Tuesday" }, { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" }, { dow: 5, label: "Friday" }, { dow: 6, label: "Saturday" }, { dow: 0, label: "Sunday" },
];

interface DayState { active: boolean; start: string; end: string; }

const hhmm = (t: string | null | undefined, fallback: string) => (t ? t.slice(0, 5) : fallback);

/** Advocate editor for weekly availability (one window per day) — clients book
 *  against these slots. Reads/writes advocate_availability for the signed-in advocate. */
export function AdvocateAvailabilityEditor() {
  const { user } = useAuth();
  const [days, setDays] = useState<Record<number, DayState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase.from("advocate_availability")
      .select("day_of_week, start_time, end_time, active").eq("advocate_id", user.id);
    const map: Record<number, DayState> = {};
    for (const d of DAYS) map[d.dow] = { active: false, start: "09:00", end: "17:00" };
    for (const r of data ?? []) {
      map[r.day_of_week] = { active: r.active, start: hhmm(r.start_time, "09:00"), end: hhmm(r.end_time, "17:00") };
    }
    setDays(map);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    // Replace this advocate's availability with the current per-day windows.
    await supabase.from("advocate_availability").delete().eq("advocate_id", user.id);
    const rows = DAYS
      .filter((d) => days[d.dow]?.active && days[d.dow].start < days[d.dow].end)
      .map((d) => ({ advocate_id: user.id, day_of_week: d.dow, start_time: days[d.dow].start, end_time: days[d.dow].end, active: true }));
    let error = null;
    if (rows.length) ({ error } = await supabase.from("advocate_availability").insert(rows));
    setSaving(false);
    if (error) { toast.error("Couldn't save availability"); load(); return; }
    toast.success("Availability saved");
    load();
  };

  const set = (dow: number, patch: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [dow]: { ...prev[dow], ...patch } }));

  if (loading) return <div className="text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline" /> Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-accent" />
        <h2 className="font-display text-xl text-primary-deep">Booking availability</h2>
      </div>
      <p className="text-sm text-muted-foreground">Clients can book consultations within these hours (Perth time). Toggle a day off to block it out.</p>
      <div className="space-y-2">
        {DAYS.map((d) => {
          const s = days[d.dow];
          return (
            <div key={d.dow} className="flex items-center gap-3 p-2 rounded-xl bg-secondary/30">
              <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer">
                <input type="checkbox" checked={s?.active ?? false} onChange={(e) => set(d.dow, { active: e.target.checked })} />
                <span className="text-sm font-medium">{d.label}</span>
              </label>
              <Input type="time" value={s?.start ?? "09:00"} disabled={!s?.active} onChange={(e) => set(d.dow, { start: e.target.value })} className="h-10 rounded-xl w-32" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="time" value={s?.end ?? "17:00"} disabled={!s?.active} onChange={(e) => set(d.dow, { end: e.target.value })} className="h-10 rounded-xl w-32" />
            </div>
          );
        })}
      </div>
      <Button onClick={save} disabled={saving} className="rounded-2xl gap-2 bg-gradient-ocean">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save availability
      </Button>
    </div>
  );
}
