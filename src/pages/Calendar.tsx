import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/ocean/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, LocateFixed, Check, ListTodo, CalendarClock, History, Layers, Stethoscope, ClipboardList, Briefcase, Lock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { NewAppointmentDialog } from "@/components/ocean/NewAppointmentDialog";
import { AddOnDayDialog } from "@/components/ocean/AddOnDayDialog";
import { CLIENT_COLOURS, ClientColourKey } from "@/lib/types";
import { toast } from "sonner";
import { markSectionViewed } from "@/lib/attention-badges";

type ApptOutcome = "scheduled" | "attended" | "rescheduled" | "cancelled_missed";

interface Appt {
  id: string;
  client_id: string;
  created_by: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  notes: string | null;
  outcome: ApptOutcome;
  category: string | null;
  provider_name: string | null;
  practitioner_name: string | null;
  client_visible_notes: string | null;
  advocate_private_notes: string | null;
  preparation_instructions: string | null;
  what_to_bring: string | null;
  availability_request_id: string | null;
}

const OUTCOME_LABEL: Record<ApptOutcome, string> = {
  scheduled: "Upcoming",
  attended: "Attended",
  rescheduled: "Rescheduled",
  cancelled_missed: "Cancelled / Missed",
};

const OUTCOME_TONE: Record<ApptOutcome, { bg: string; fg: string }> = {
  scheduled: { bg: "hsl(200 70% 94%)", fg: "hsl(210 40% 28%)" },
  attended: { bg: "hsl(155 45% 90%)", fg: "hsl(155 45% 24%)" },
  rescheduled: { bg: "hsl(38 70% 92%)", fg: "hsl(28 45% 28%)" },
  cancelled_missed: { bg: "hsl(10 55% 92%)", fg: "hsl(10 40% 30%)" },
};

interface TaskRow {
  id: string;
  client_id: string;
  created_by: string;
  title: string;
  status: "to_do" | "complete";
  due_date: string | null;
  due_time: string | null;
  time_block_end: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string;
  client_colour: string;
}

const MONTHS_BACK = 2;
const MONTHS_FORWARD = 36;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const ALL = "__all__";

function ymKey(y: number, m: number) { return `${y}-${m}`; }
function dKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function colourFor(p?: ProfileLite): { bg: string; ring: string; text: string } {
  const key = (p?.client_colour ?? "ocean") as ClientColourKey;
  return CLIENT_COLOURS[key] ?? CLIENT_COLOURS.ocean;
}
function parseDue(d: string): Date {
  // YYYY-MM-DD as local date
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

export default function CalendarPage() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<Appt[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [selected, setSelected] = useState<Date | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<Date | null>(null);
  const [filterClient, setFilterClient] = useState<string>(ALL);
  const [showPast, setShowPast] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("calendar.showPast") === "1";
  });
  const [showCompletedTasks, setShowCompletedTasks] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("calendar.showCompletedTasks") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("calendar.showPast", showPast ? "1" : "0"); } catch { /* ignore */ }
  }, [showPast]);
  useEffect(() => {
    try { window.localStorage.setItem("calendar.showCompletedTasks", showCompletedTasks ? "1" : "0"); } catch { /* ignore */ }
  }, [showCompletedTasks]);
  const [tickAnim, setTickAnim] = useState<Record<string, boolean>>({});
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const monthRefs = useRef<Record<string, HTMLElement | null>>({});

  const isAdvocate = role === "advocate";
  const isClient = role === "client";
  const shellRole = isAdvocate ? "advocate" : "client";

  useEffect(() => { markSectionViewed("calendar"); }, []);


  const load = useCallback(async () => {
    const [apptRes, taskRes] = await Promise.all([
      supabase.from("appointments")
        .select("id,client_id,created_by,title,location,starts_at,ends_at,notes,outcome,category,provider_name,practitioner_name,client_visible_notes,preparation_instructions,what_to_bring,availability_request_id")
        .order("starts_at", { ascending: true }),
      supabase.from("tasks")
        .select("id,client_id,created_by,title,status,due_date,due_time,time_block_end")
        .or("due_date.not.is.null,due_time.not.is.null"),
    ]);
    let appts = ((apptRes.data as any[]) ?? []).map((a) => ({ ...a, advocate_private_notes: null })) as Appt[];
    const tks = (taskRes.data as TaskRow[]) ?? [];
    if (isAdvocate) {
      const { data: noteRows } = await supabase.rpc("get_appointment_private_notes_map");
      const noteMap = new Map<string, string>();
      (noteRows as Array<{ id: string; advocate_private_notes: string | null }> | null ?? [])
        .forEach((r) => { if (r.advocate_private_notes) noteMap.set(r.id, r.advocate_private_notes); });
      appts = appts.map((a) => ({ ...a, advocate_private_notes: noteMap.get(a.id) ?? null }));
    }
    setItems(appts);
    setTasks(tks);

    // Always pull profiles for client_colour + names (RLS lets clients see only their own; advocate sees all)
    const ids = Array.from(new Set([
      ...appts.map(a => a.client_id),
      ...tks.map(t => t.client_id),
    ]));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email,client_colour").in("id", ids);
      const map: Record<string, ProfileLite> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p as ProfileLite; });
      setProfiles(map);
    } else {
      setProfiles({});
    }
  }, [isAdvocate]);

  useEffect(() => { if (role) load(); }, [role, load]);

  const today = useMemo(() => new Date(), []);

  const months = useMemo(() => {
    const list: { y: number; m: number }[] = [];
    const start = new Date(today.getFullYear(), today.getMonth() - MONTHS_BACK, 1);
    for (let i = 0; i < MONTHS_BACK + MONTHS_FORWARD + 1; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      list.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    return list;
  }, [today]);

  // Apply per-client filter (advocate-only)
  // Default view = upcoming only. Toggle re-reveals past outcomes.
  const visibleAppts = useMemo(() => {
    const byOutcome = showPast ? items : items.filter(a => a.outcome === "scheduled");
    return filterClient === ALL ? byOutcome : byOutcome.filter(a => a.client_id === filterClient);
  }, [items, filterClient, showPast]);
  const visibleTasks = useMemo(() => {
    const byStatus = showCompletedTasks ? tasks : tasks.filter(t => t.status !== "complete");
    return filterClient === ALL ? byStatus : byStatus.filter(t => t.client_id === filterClient);
  }, [tasks, filterClient, showCompletedTasks]);

  // Index by day
  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appt[]>();
    visibleAppts.forEach(a => {
      const d = new Date(a.starts_at);
      const k = dKey(d);
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    });
    return map;
  }, [visibleAppts]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    visibleTasks.forEach(t => {
      let d: Date | null = null;
      if (t.due_time) d = new Date(t.due_time);
      else if (t.due_date) d = parseDue(t.due_date);
      if (!d) return;
      const k = dKey(d);
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    });
    return map;
  }, [visibleTasks]);

  const clientList = useMemo(() => {
    const ids = new Set<string>();
    items.forEach(a => ids.add(a.client_id));
    tasks.forEach(t => ids.add(t.client_id));
    return Array.from(ids).map(id => profiles[id]).filter(Boolean) as ProfileLite[];
  }, [items, tasks, profiles]);

  const jumpToToday = useCallback(() => {
    const key = ymKey(today.getFullYear(), today.getMonth());
    const el = monthRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setSelected(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  }, [today]);

  useEffect(() => {
    const key = ymKey(today.getFullYear(), today.getMonth());
    const el = monthRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "auto", inline: "start", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollByMonths = (dir: -1 | 1) => {
    const s = scrollerRef.current;
    if (!s) return;
    s.scrollBy({ left: dir * s.clientWidth, behavior: "smooth" });
  };

  const selectedAppts = selected ? (apptsByDay.get(dKey(selected)) ?? []) : [];
  const selectedTasks = selected ? (tasksByDay.get(dKey(selected)) ?? []) : [];

  const setStatus = async (a: Appt, outcome: ApptOutcome) => {
    if (a.outcome === outcome) return;
    const { error } = await supabase.from("appointments").update({ outcome }).eq("id", a.id);
    if (error) { toast.error("Couldn't save — try again"); return; }
    if (outcome === "attended") toast.success("Lovely — marked as attended.");
    else if (outcome === "rescheduled") toast("Rescheduled — all good.", { description: "The client kept us in the loop." });
    else if (outcome === "cancelled_missed") toast("Noted — no worries. The bar will adjust gently.", { description: "Marked as cancelled / missed." });
    else toast("Status reset to upcoming.");
    load();
  };

  const rescheduleTo = async (a: Appt, newIso: string) => {
    const { error } = await supabase
      .from("appointments")
      .update({ starts_at: newIso, outcome: "rescheduled" })
      .eq("id", a.id);
    if (error) { toast.error("Couldn't save — try again"); return; }
    toast("Moved to the new date — kindly noted.");
    load();
  };

  const toggleTask = async (t: TaskRow) => {
    if (t.status === "complete") return;
    setTickAnim((m) => ({ ...m, [t.id]: true }));
    const { error } = await supabase
      .from("tasks")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", t.id);
    if (error) { toast.error("Couldn't save — try again"); setTickAnim((m) => ({ ...m, [t.id]: false })); return; }
    setTimeout(() => { load(); }, 450);
  };

  const openAddOnDay = (d: Date) => {
    if (!isAdvocate && !isClient) return;
    setAddDate(d);
    setAddOpen(true);
  };

  return (
    <AppShell
      role={shellRole}
      title="Calendar"
      subtitle={isAdvocate ? "Master view — every appointment, every client." : "Your calendar — shared gently with your advocate."}
    >
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        {isAdvocate && (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Showing:</span>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="h-9 rounded-2xl w-full sm:w-auto sm:min-w-[200px] bg-card/80 border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All clients</SelectItem>
                {clientList.map(p => {
                  const c = colourFor(p);
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.bg }} />
                        {p.full_name || p.email}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        <label
          htmlFor="show-past-appts"
          className="inline-flex items-center gap-2 rounded-2xl bg-card/80 border border-border/60 px-3 h-9 cursor-pointer select-none"
        >
          <History className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs text-primary-deep">Show past appointments</span>
          <Switch id="show-past-appts" checked={showPast} onCheckedChange={setShowPast} />
        </label>

        <label
          htmlFor="show-completed-tasks"
          className="inline-flex items-center gap-2 rounded-2xl bg-card/80 border border-border/60 px-3 h-9 cursor-pointer select-none"
        >
          <ListTodo className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs text-primary-deep">Show completed tasks</span>
          <Switch id="show-completed-tasks" checked={showCompletedTasks} onCheckedChange={setShowCompletedTasks} />
        </label>

        {isAdvocate && <NewAppointmentDialog onCreated={load} />}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 min-w-0">
        <div className="lg:col-span-2 min-w-0 glass-card p-2 sm:p-5 overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <div className="flex items-center gap-2 text-primary-deep min-w-0">
              <CalendarDays className="h-4 w-4 text-accent shrink-0" />
              <span className="font-display text-sm sm:text-base truncate">
                <span className="hidden sm:inline">Scroll across months →</span>
                <span className="sm:hidden">Months →</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button type="button" size="sm" variant="outline" onClick={() => scrollByMonths(-1)} aria-label="Previous months" className="h-9 w-9 p-0 rounded-full border-border/60">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" onClick={jumpToToday} className="h-9 rounded-full bg-gradient-ocean text-primary-foreground shadow-soft gap-1.5 px-3">
                <LocateFixed className="h-4 w-4" /> Today
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => scrollByMonths(1)} aria-label="Next months" className="h-9 w-9 p-0 rounded-full border-border/60">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="bg-card/90 backdrop-blur-md rounded-2xl px-1.5 sm:px-2 py-2 mb-2 sm:mb-3 border border-border/40">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-center text-muted-foreground font-semibold">
              {DAY_LABELS.map((d, i) => <div key={i}>{d}</div>)}
            </div>
          </div>

          <div
            ref={scrollerRef}
            className="flex w-full min-w-0 overflow-x-auto snap-x snap-mandatory pb-3 scroll-smooth"
            style={{ scrollbarWidth: "thin" }}
          >
            {months.map(({ y, m }) => {
              const key = ymKey(y, m);
              const firstDay = new Date(y, m, 1).getDay();
              const daysInMonth = new Date(y, m + 1, 0).getDate();
              const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => {
                const dayNum = i - firstDay + 1;
                return dayNum > 0 ? dayNum : null;
              });
              const monthName = new Date(y, m, 1).toLocaleString("en", { month: "long", year: "numeric" });
              return (
                <section
                  key={key}
                  ref={(el) => { monthRefs.current[key] = el; }}
                  className="snap-start shrink-0 grow-0 basis-full min-w-0 px-0.5 sm:px-1"
                >
                  <h2 className="font-display text-base sm:text-xl text-primary-deep mb-2 sm:mb-3 px-1">{monthName}</h2>
                  <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                    {cells.map((d, i) => {
                      if (!d) return <div key={i} className="aspect-square" />;
                      const cellDate = new Date(y, m, d);
                      const isToday = sameDay(cellDate, today);
                      const isSelected = selected && sameDay(cellDate, selected);
                      const dayAppts = apptsByDay.get(dKey(cellDate)) ?? [];
                      const dayTasks = tasksByDay.get(dKey(cellDate)) ?? [];
                      const hasAppt = dayAppts.length > 0;
                      const hasTask = dayTasks.length > 0;
                      // up to 3 colour dots
                      const dots = dayAppts.slice(0, 3).map(a => ({ bg: colourFor(profiles[a.client_id]).bg, past: a.outcome !== "scheduled" }));
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setSelected(cellDate); openAddOnDay(cellDate); }}
                          className={`aspect-square min-h-[44px] rounded-xl sm:rounded-2xl flex flex-col items-center justify-center text-[13px] sm:text-sm transition-calm border touch-manipulation ${
                            isSelected
                              ? "bg-accent/20 border-accent text-primary-deep font-semibold shadow-soft"
                              : isToday
                                ? "bg-gradient-ocean text-primary-foreground font-bold shadow-soft border-transparent"
                                : (hasAppt || hasTask)
                                  ? "bg-secondary text-primary-deep font-semibold border-transparent hover:bg-secondary/80"
                                  : "border-transparent hover:bg-secondary/50 text-foreground"
                          }`}
                        >
                          <span>{d}</span>
                          {(hasAppt || hasTask) && !isToday && (
                            <span className="mt-0.5 flex items-center gap-0.5">
                              {dots.map((dot, idx) => (
                                <span key={idx} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot.bg, opacity: dot.past ? 0.35 : 1 }} />
                              ))}
                              {hasTask && (() => {
                                const allDone = dayTasks.every(t => t.status === "complete");
                                return <ListTodo className="h-2.5 w-2.5 ml-0.5" style={{ opacity: allDone ? 0.35 : 0.7 }} />;
                              })()}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <aside className="space-y-3">
          <h3 className="font-display text-lg text-primary-deep">
            {selected ? selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Upcoming"}
          </h3>

          {selected ? (
            (selectedAppts.length === 0 && selectedTasks.length === 0) ? (
              <div className="glass-card p-5 text-sm text-muted-foreground">
                Nothing scheduled on this day yet.
              </div>
            ) : (
              <>
                {(() => {
                  // Group by client_id + starts_at so same-time appointments read as a clear stack
                  const groups: Appt[][] = [];
                  const idx = new Map<string, number>();
                  selectedAppts.forEach((a) => {
                    const k = `${a.client_id}__${a.starts_at}`;
                    const i = idx.get(k);
                    if (i === undefined) { idx.set(k, groups.length); groups.push([a]); }
                    else { groups[i].push(a); }
                  });

                  const renderCard = (a: Appt) => {
                    const owner = profiles[a.client_id];
                    const c = colourFor(owner);
                    const time = new Date(a.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const isPast = new Date(a.starts_at) < new Date();
                    const addedByClient = a.created_by === a.client_id;
                    const byMe = user?.id === a.created_by;
                    const tone = OUTCOME_TONE[a.outcome];
                    return (
                      <div key={a.id} className="glass-card p-3 sm:p-5 border-l-4 space-y-3" style={{ borderLeftColor: c.bg }}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-accent">{time}</p>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5"
                            style={{ backgroundColor: tone.bg, color: tone.fg }}
                          >
                            {OUTCOME_LABEL[a.outcome]}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{a.title}</p>
                          {isAdvocate && owner && (
                            <p className="text-xs text-muted-foreground">{owner.full_name || owner.email}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {byMe ? "Added by you" : (addedByClient ? "Added by the client" : "Added by your advocate")}
                            {isPast && a.outcome === "scheduled" && <span> · was scheduled for this date</span>}
                          </p>
                        </div>
                        {a.location && (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {a.location}
                          </div>
                        )}
                        {(a.category || a.provider_name || a.practitioner_name) && (
                          <div className="flex flex-wrap gap-1.5 text-[11px]">
                            {a.category && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-primary-deep">
                                <Stethoscope className="h-3 w-3" /> {a.category.replace(/_/g, " ")}
                              </span>
                            )}
                            {a.provider_name && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-primary-deep">
                                {a.provider_name}
                              </span>
                            )}
                            {a.practitioner_name && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-primary-deep">
                                {a.practitioner_name}
                              </span>
                            )}
                          </div>
                        )}
                        {a.client_visible_notes && (
                          <p className="text-xs text-primary-deep whitespace-pre-wrap rounded-xl bg-secondary/30 p-2">{a.client_visible_notes}</p>
                        )}
                        {a.preparation_instructions && (
                          <div className="text-xs text-primary-deep rounded-xl bg-accent/10 p-2">
                            <p className="uppercase tracking-wide text-[10px] text-muted-foreground flex items-center gap-1 mb-1"><ClipboardList className="h-3 w-3" /> Preparation</p>
                            <p className="whitespace-pre-wrap">{a.preparation_instructions}</p>
                          </div>
                        )}
                        {a.what_to_bring && (
                          <div className="text-xs text-primary-deep rounded-xl bg-accent/10 p-2">
                            <p className="uppercase tracking-wide text-[10px] text-muted-foreground flex items-center gap-1 mb-1"><Briefcase className="h-3 w-3" /> What to bring</p>
                            <p className="whitespace-pre-wrap">{a.what_to_bring}</p>
                          </div>
                        )}
                        {isAdvocate && a.advocate_private_notes && (
                          <div className="text-xs text-primary-deep rounded-xl bg-accent/15 border border-accent/30 p-2">
                            <p className="uppercase tracking-wide text-[10px] text-muted-foreground flex items-center gap-1 mb-1"><Lock className="h-3 w-3" /> Private advocate notes</p>
                            <p className="whitespace-pre-wrap">{a.advocate_private_notes}</p>
                          </div>
                        )}
                        {isAdvocate && a.availability_request_id && (
                          <Link
                            to={`/advocate/availability/${a.availability_request_id}/review`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> View availability request
                          </Link>
                        )}
                        {isAdvocate && (
                          <AdvocateStatusEditor a={a} onChange={(s) => setStatus(a, s)} onReschedule={(iso) => rescheduleTo(a, iso)} />
                        )}
                      </div>
                    );
                  };

                  return groups.map((group) => {
                    if (group.length === 1) return renderCard(group[0]);
                    const first = group[0];
                    const c = colourFor(profiles[first.client_id]);
                    return (
                      <div
                        key={`${first.client_id}__${first.starts_at}`}
                        className="rounded-3xl bg-secondary/30 border-l-4 p-3 sm:p-4 space-y-2.5"
                        style={{ borderLeftColor: c.bg }}
                      >
                        <div className="flex items-center gap-2 px-1">
                          <Layers className="h-3.5 w-3.5 text-accent" />
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {group.length} at the same time — both are separate
                          </span>
                        </div>
                        <div className="space-y-2 pl-2">
                          {group.map(renderCard)}
                        </div>
                      </div>
                    );
                  });
                })()}

                {selectedTasks.map(t => {
                  const owner = profiles[t.client_id];
                  const c = colourFor(owner);
                  const done = t.status === "complete";
                  const animating = tickAnim[t.id];
                  return (
                    <div key={t.id} className={`glass-card p-3 sm:p-5 border-l-4 flex items-start gap-3 transition-calm ${done ? "opacity-60" : ""}`} style={{ borderLeftColor: c.bg }}>
                      <button
                        type="button"
                        onClick={() => toggleTask(t)}
                        aria-label={done ? "Completed" : "Mark complete"}
                        disabled={done}
                        className={`mt-0.5 h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 shrink-0 ${
                          done || animating
                            ? "bg-gradient-ocean border-transparent text-primary-foreground shadow-soft scale-110"
                            : "border-border/60 hover:border-accent hover:bg-accent/10"
                        }`}
                      >
                        {(done || animating) && (
                          <Check className={`h-4 w-4 ${animating ? "animate-scale-in" : ""}`} strokeWidth={3} />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                          {t.due_time
                            ? `Task · ${new Date(t.due_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${t.time_block_end ? ` – ${new Date(t.time_block_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
                            : "Task"}
                        </p>
                        <p className={`font-semibold mt-0.5 ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.title}</p>
                        {isAdvocate && owner && (
                          <p className="text-xs text-muted-foreground">{owner.full_name || owner.email}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )
          ) : (
            <>
              {visibleAppts.length === 0 && (
                <div className="glass-card p-5 text-sm text-muted-foreground">
                  {isAdvocate ? "No appointments scheduled yet." : "You have no upcoming appointments."}
                </div>
              )}
              {visibleAppts
                .filter(a => new Date(a.starts_at) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
                .slice(0, 8)
                .map(a => {
                  const owner = profiles[a.client_id];
                  const c = colourFor(owner);
                  const d = new Date(a.starts_at);
                  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelected(new Date(d.getFullYear(), d.getMonth(), d.getDate()))}
                      className="w-full text-left glass-card p-3 sm:p-5 hover:shadow-float transition-calm border-l-4"
                      style={{ borderLeftColor: c.bg }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent">{label}</p>
                      <p className="font-semibold text-foreground mt-1">{a.title}</p>
                      {isAdvocate && owner && (
                        <p className="text-xs text-muted-foreground">{owner.full_name || owner.email}</p>
                      )}
                    </button>
                  );
                })}
            </>
          )}
        </aside>
      </div>

      {(isAdvocate || isClient) && (
        <AddOnDayDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          date={addDate}
          onCreated={load}
          mode={isAdvocate ? "advocate" : "client"}
        />
      )}
    </AppShell>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AdvocateStatusEditor({
  a,
  onChange,
  onReschedule,
}: {
  a: Appt;
  onChange: (s: ApptOutcome) => void;
  onReschedule: (iso: string) => void;
}) {
  const [openReschedule, setOpenReschedule] = useState(false);
  const [whenLocal, setWhenLocal] = useState<string>(() => toLocalInput(a.starts_at));

  return (
    <div className="pt-1 border-t border-border/40 space-y-2">
      <Label className="text-xs text-muted-foreground">Status (changeable any time)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={a.outcome} onValueChange={(v) => onChange(v as ApptOutcome)}>
          <SelectTrigger className="h-9 rounded-2xl flex-1 min-w-0 sm:min-w-[180px] bg-card border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="scheduled">Upcoming</SelectItem>
            <SelectItem value="attended">Attended (+25%)</SelectItem>
            <SelectItem value="rescheduled">Rescheduled (client informed)</SelectItem>
            <SelectItem value="cancelled_missed">Cancelled / Missed (no contact, −10%)</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpenReschedule((v) => !v)}
          className="h-9 rounded-2xl gap-1.5 border-border/60"
        >
          <CalendarClock className="h-4 w-4" /> Move date
        </Button>
      </div>
      {openReschedule && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="flex-1 min-w-0 sm:min-w-[200px] space-y-1">
            <Label className="text-xs text-muted-foreground">New date & time</Label>
            <Input
              type="datetime-local"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => { onReschedule(new Date(whenLocal).toISOString()); setOpenReschedule(false); }}
            className="h-9 rounded-2xl bg-gradient-ocean shadow-soft"
          >
            Save new date
          </Button>
        </div>
      )}
    </div>
  );
}
