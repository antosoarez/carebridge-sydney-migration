import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, CalendarClock, CalendarIcon, Check, ChevronDown, Clock, Pencil, Plus, Scissors, Star, Trash2, Wand2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { TaskRow, useTasks } from "@/lib/tasks-store";
import { TaskSubtasks } from "./TaskSubtasks";
import { TaskBreakdownDialog } from "./TaskBreakdownDialog";

interface Props {
  clientId: string;
  canManage: boolean;
  subtaskTemplateGroup?: "advocate" | "client";
  /**
   * How to surface completed tasks.
   * - "collapsed" (default): show under a collapsed "Recently completed" section
   * - "hidden": don't show completed tasks at all (used on the dashboard)
   */
  completedDisplay?: "collapsed" | "hidden";
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function countdownLabel(dateStr: string): { label: string; tone: "overdue" | "urgent" | "soon" | "ok" } {
  const d = daysUntil(dateStr);
  if (d < 0) return { label: `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`, tone: "overdue" };
  if (d === 0) return { label: "Due today", tone: "urgent" };
  if (d === 1) return { label: "Due tomorrow", tone: "urgent" };
  if (d <= 3) return { label: `${d} days left`, tone: "soon" };
  return { label: `${d} days left`, tone: "ok" };
}

// ── time helpers ────────────────────────────────────────────────────────────
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
function timeBlockLabel(t: TaskRow): string | null {
  if (!t.due_time) return null;
  const s = new Date(t.due_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (t.time_block_end) {
    const e = new Date(t.time_block_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${s} – ${e}`;
  }
  return s;
}

export function ClientTasksPanel({ clientId, canManage, subtaskTemplateGroup, completedDisplay = "collapsed" }: Props) {
  const { tasks, loading, create, update, toggle, remove } = useTasks(clientId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  // Optional time block
  const [useTimeBlock, setUseTimeBlock] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  // Optional reminder
  const [useReminder, setUseReminder] = useState(false);
  const [reminderLocal, setReminderLocal] = useState("");
  // Priority flag
  const [isPriority, setIsPriority] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [breakdownFor, setBreakdownFor] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const templateGroup: "advocate" | "client" = subtaskTemplateGroup ?? (canManage ? "advocate" : "client");

  const resetForm = () => {
    setTitle(""); setDescription(""); setDueDate(undefined);
    setUseTimeBlock(false); setStartLocal(""); setEndLocal("");
    setUseReminder(false); setReminderLocal("");
    setIsPriority(false);
  };

  const openNew = () => { setEditing(null); resetForm(); setDialogOpen(true); };

  const openEdit = (t: TaskRow) => {
    setEditing(t);
    setTitle(t.title);
    setDescription(t.description ?? "");
    setDueDate(t.due_date ? new Date(t.due_date + "T00:00:00") : undefined);
    setUseTimeBlock(!!t.due_time);
    setStartLocal(toLocalInput(t.due_time));
    setEndLocal(toLocalInput(t.time_block_end));
    setUseReminder(!!t.reminder_at);
    setReminderLocal(toLocalInput(t.reminder_at));
    setIsPriority(!!t.is_priority);
    setDialogOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const dueISO = dueDate ? format(dueDate, "yyyy-MM-dd") : null;
    const dueTime = useTimeBlock ? fromLocalInput(startLocal) : null;
    const blockEnd = useTimeBlock && endLocal ? fromLocalInput(endLocal) : null;
    const remind = useReminder ? fromLocalInput(reminderLocal) : null;
    try {
      if (editing) {
        await update(editing.id, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueISO,
          due_time: dueTime,
          time_block_end: blockEnd,
          reminder_at: remind,
          reminder_sent_at: remind && editing.reminder_at !== remind ? null : undefined,
          is_priority: isPriority,
        });
        toast({ title: "Task updated" });
      } else {
        await create({
          client_id: clientId,
          title, description, due_date: dueISO,
          due_time: dueTime, time_block_end: blockEnd,
          reminder_at: remind, is_priority: isPriority,
        });
        toast({ title: "Task added" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Couldn't save task", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const onToggle = async (t: TaskRow) => {
    try { await toggle(t); } catch (err: any) {
      toast({ title: "Couldn't update", description: err?.message ?? "", variant: "destructive" });
    }
  };

  const onDelete = async (t: TaskRow) => {
    if (!confirm(`Delete "${t.title}"?`)) return;
    try { await remove(t.id); toast({ title: "Task deleted" }); } catch (err: any) {
      toast({ title: "Couldn't delete", description: err?.message ?? "", variant: "destructive" });
    }
  };

  const open = tasks.filter((t) => t.status === "to_do");
  const overdue = open.filter((t) => t.due_date && daysUntil(t.due_date) < 0);
  const toDo = open.filter((t) => !overdue.includes(t));
  // Only "recent wins" — last 30 days. Older completions live in the Care Journey timeline.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const done = completedDisplay === "hidden"
    ? []
    : tasks
        .filter((t) => t.status === "complete")
        .filter((t) => {
          if (!t.completed_at) return true;
          return new Date(t.completed_at).getTime() >= cutoff;
        })
        .sort((a, b) => {
          const at = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return bt - at;
        });

  const renderItem = (t: TaskRow) => {
    const completed = t.status === "complete";
    const cd = t.due_date ? countdownLabel(t.due_date) : null;
    const isOverdue = !completed && cd?.tone === "overdue";
    const toneCls = cd && {
      overdue: "bg-destructive/15 text-destructive",
      urgent: "bg-amber-100 text-amber-800",
      soon: "bg-amber-50 text-amber-700",
      ok: "bg-secondary text-secondary-foreground",
    }[cd.tone];
    const isExpanded = expandedId === t.id;
    const tl = timeBlockLabel(t);
    return (
      <div key={t.id} className={cn("glass-card p-4", isOverdue && "ring-1 ring-destructive/30 bg-destructive/[0.03]")}>
        <div className="flex items-start gap-3">
          <button
            onClick={() => onToggle(t)}
            aria-label={completed ? "Mark to do" : "Mark complete"}
            className={cn(
              "h-9 w-9 rounded-xl border-2 flex items-center justify-center shrink-0 transition-calm",
              completed ? "bg-gradient-ocean border-transparent" : "border-border hover:border-primary",
            )}
          >
            {completed && <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />}
          </button>
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-semibold text-primary-deep", completed && "line-through text-muted-foreground")}>{t.title}</p>
            {t.description && (
              <p className={cn("text-xs text-muted-foreground mt-1", completed && "line-through")}>{t.description}</p>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-destructive text-destructive-foreground shadow-soft">
                  <AlertTriangle className="h-3 w-3" /> Overdue
                </span>
              )}
              {cd && !completed && (
                <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full", toneCls)}>
                  <Clock className="h-3 w-3" /> {cd.label}
                </span>
              )}
              {tl && !completed && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
                  <Clock className="h-3 w-3" /> {tl}
                </span>
              )}
              {t.is_priority && !completed && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-accent/15 text-accent">
                  <Star className="h-3 w-3" /> Priority
                </span>
              )}
              {t.auto_dedup_key && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary"
                  title="Created automatically by CareBridge"
                >
                  <Wand2 className="h-3 w-3" /> Auto
                </span>
              )}
              {t.reminder_at && !completed && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-full bg-secondary/40">
                  🔔 {new Date(t.reminder_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {!completed && (
                <button
                  type="button"
                  onClick={() => setBreakdownFor(t.id)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-full transition-calm"
                >
                  <Scissors className="h-3 w-3" /> Break this down
                </button>
              )}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-full transition-calm"
              >
                <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                {isExpanded ? "Hide steps" : "Steps"}
              </button>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-1 shrink-0">
              {isOverdue && (
                <button
                  onClick={() => openEdit(t)}
                  className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg"
                  aria-label="Reschedule overdue task"
                  title="Reschedule — reminders are sent automatically"
                >
                  <CalendarClock className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => openEdit(t)} className="p-1.5 text-muted-foreground hover:text-primary" aria-label="Edit task">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => onDelete(t)} className="p-1.5 text-muted-foreground hover:text-destructive" aria-label="Delete task">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-primary/10 animate-fade-in">
            <TaskSubtasks parentTaskId={t.id} templateGroup={templateGroup} />
          </div>
        )}
      </div>
    );
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl text-primary-deep">Tasks</h2>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="rounded-2xl bg-gradient-ocean h-10 gap-2 shadow-soft">
                <Plus className="h-4 w-4" /> New task
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl text-primary-deep">
                  {editing ? "Edit task" : "New task"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="task-title">Title</Label>
                  <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" maxLength={200} className="h-11 rounded-xl bg-card" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-desc">Description (optional)</Label>
                  <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Any extra detail…" rows={3} className="rounded-xl bg-card" />
                </div>
                <div className="space-y-2">
                  <Label>Due date (optional)</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className={cn("flex-1 justify-start text-left font-normal h-11 rounded-xl", !dueDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                    {dueDate && (
                      <Button type="button" variant="ghost" onClick={() => setDueDate(undefined)}>Clear</Button>
                    )}
                  </div>
                </div>

                {/* Optional time block */}
                <div className="rounded-2xl bg-secondary/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="use-time-block" className="cursor-pointer">Time block (optional)</Label>
                    <Switch id="use-time-block" checked={useTimeBlock} onCheckedChange={setUseTimeBlock} />
                  </div>
                  {useTimeBlock && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Start</Label>
                        <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className="rounded-xl bg-card h-10" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">End (optional)</Label>
                        <Input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} className="rounded-xl bg-card h-10" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Optional reminder */}
                <div className="rounded-2xl bg-secondary/30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="use-reminder" className="cursor-pointer">Gentle reminder (optional)</Label>
                    <Switch id="use-reminder" checked={useReminder} onCheckedChange={(v) => {
                      setUseReminder(v);
                      if (v && !reminderLocal && useTimeBlock && startLocal) {
                        // default: 1 hour before start
                        const t = new Date(startLocal); t.setHours(t.getHours() - 1);
                        const pad = (n: number) => String(n).padStart(2, "0");
                        setReminderLocal(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`);
                      }
                    }} />
                  </div>
                  {useReminder && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Remind me at</Label>
                      <Input type="datetime-local" value={reminderLocal} onChange={(e) => setReminderLocal(e.target.value)} className="rounded-xl bg-card h-10" />
                      <p className="text-[11px] text-muted-foreground">A soft chime, an in-app note, and a gentle email.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-secondary/30 p-3">
                  <Label htmlFor="is-priority" className="cursor-pointer flex items-center gap-2">
                    <Star className="h-4 w-4 text-accent" /> Mark as priority
                  </Label>
                  <Switch id="is-priority" checked={isPriority} onCheckedChange={setIsPriority} />
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting || !title.trim()} className="rounded-2xl bg-gradient-ocean">
                    {submitting ? "Saving…" : editing ? "Save changes" : "Add task"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">
          <p className="font-display text-base text-primary-deep">No tasks yet</p>
          <p className="text-sm mt-1">
            {canManage ? "Add a task to get started." : "Your advocate hasn't added any tasks for you yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <div id="overdue-section" className="scroll-mt-24">
              <h3 className="text-xs uppercase tracking-wider text-destructive font-semibold mb-2">
                Overdue ({overdue.length})
              </h3>
              <div className="space-y-2">{overdue.map(renderItem)}</div>
            </div>
          )}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              To do ({toDo.length})
            </h3>
            {toDo.length === 0 ? (
              <p className="text-sm text-muted-foreground">All caught up.</p>
            ) : (
              <div className="space-y-2">{toDo.map(renderItem)}</div>
            )}
          </div>
          {completedDisplay === "collapsed" && done.length > 0 && (
            <div className="rounded-3xl bg-secondary/30 border border-primary/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setCompletedOpen((v) => !v)}
                aria-expanded={completedOpen}
                aria-controls="completed-tasks-list"
                className="w-full flex items-center justify-between gap-3 px-4 py-4 sm:py-3 text-left transition-calm hover:bg-secondary/50 min-h-[48px]"
              >
                <span className="text-sm font-semibold text-primary-deep">
                  Recently completed ({done.length}) 🌊
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-300",
                    completedOpen && "rotate-180",
                  )}
                />
              </button>
              <div
                id="completed-tasks-list"
                className={cn(
                  "grid transition-all duration-500 ease-out",
                  completedOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 pt-1 space-y-2 opacity-75">
                    {done.map(renderItem)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {breakdownFor && (
        <TaskBreakdownDialog
          open={!!breakdownFor}
          onOpenChange={(o) => !o && setBreakdownFor(null)}
          parentTaskId={breakdownFor}
          templateGroup={templateGroup}
        />
      )}
    </section>
  );
}
