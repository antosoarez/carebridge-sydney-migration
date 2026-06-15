import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Clock, Star, Scissors, Check } from "lucide-react";
import { useTasks, type TaskRow } from "@/lib/tasks-store";
import { TaskBreakdownDialog } from "./TaskBreakdownDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  userId: string;
  /** Which template group powers the "Break this down" picker. */
  templateGroup: "advocate" | "client";
  /** Where the "See all" link goes. */
  todoHref: string;
}

function isDueToday(t: TaskRow): boolean {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (t.due_date) {
    const [yy, mm, dd] = t.due_date.split("-").map(Number);
    if (yy === y && mm - 1 === m && dd === d) return true;
  }
  if (t.due_time) {
    const dt = new Date(t.due_time);
    if (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) return true;
  }
  return false;
}

function timeLabel(t: TaskRow): string | null {
  if (t.due_time) {
    const dt = new Date(t.due_time);
    const s = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (t.time_block_end) {
      const e = new Date(t.time_block_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `${s} – ${e}`;
    }
    return s;
  }
  return null;
}

/**
 * Today's Focus card — reads real to-dos for the current user.
 * Shows up to 3 open tasks that are due today or marked priority.
 * Updates live via the realtime subscription in useTasks.
 */
export function TodaysFocusCard({ userId, templateGroup, todoHref }: Props) {
  const { tasks, toggle } = useTasks(userId);
  const [breakdownFor, setBreakdownFor] = useState<string | null>(null);

  const focus = useMemo(() => {
    const open = tasks.filter((t) => t.status === "to_do");
    const dueToday = open.filter(isDueToday);
    const priority = open.filter((t) => t.is_priority && !isDueToday(t));
    return [...dueToday, ...priority].slice(0, 3);
  }, [tasks]);

  const onComplete = async (t: TaskRow) => {
    try { await toggle(t); toast("Done — well done 🌊", { duration: 2500 }); }
    catch (err: any) { toast.error("Couldn't update", { description: err?.message ?? "" }); }
  };

  const title = focus.length === 0
    ? "You're all caught up 🌊"
    : focus.length === 1
      ? "Today you only need to do 1 thing."
      : `${focus.length} gentle things for today.`;
  const subtitle = focus.length === 0
    ? "Nothing due right now. Enjoy the calm."
    : "Take them one at a time — no rush.";

  return (
    <section className="glass-card p-6 md:p-8 mb-6 bg-gradient-card relative overflow-hidden">
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gradient-ocean opacity-10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Today's focus
          </div>
          <Link to={todoHref} className="text-xs font-medium text-primary hover:underline">See all</Link>
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-primary-deep mt-2 text-balance">{title}</h2>
        <p className="text-muted-foreground mt-1">{subtitle}</p>

        {focus.length > 0 && (
          <ul className="mt-4 space-y-2">
            {focus.map((t) => {
              const tl = timeLabel(t);
              return (
                <li key={t.id} className="rounded-2xl bg-background/60 backdrop-blur-sm px-4 py-3 shadow-soft animate-fade-in flex items-start gap-3">
                  <button
                    onClick={() => onComplete(t)}
                    aria-label="Mark complete"
                    className={cn(
                      "h-8 w-8 rounded-xl border-2 flex items-center justify-center shrink-0 transition-calm",
                      "border-border hover:border-primary",
                    )}
                  >
                    <Check className="h-4 w-4 text-primary opacity-0" strokeWidth={3} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary-deep break-words">{t.title}</p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {tl && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          <Clock className="h-3 w-3" /> {tl}
                        </span>
                      )}
                      {t.is_priority && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                          <Star className="h-3 w-3" /> Priority
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setBreakdownFor(t.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:bg-primary/10 px-2 py-0.5 rounded-full transition-calm"
                      >
                        <Scissors className="h-3 w-3" /> Break this down
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
