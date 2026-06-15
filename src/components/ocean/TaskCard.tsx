import { useState } from "react";
import { Link } from "react-router-dom";
import { Task, countdownLabel, daysLeft } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { Check, Clock, FileUp, MessageCircle, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

const categoryIcon = {
  appointment: Stethoscope,
  document: FileUp,
  communication: MessageCircle,
  test: Stethoscope,
};

export function TaskCard({ task, role = "client" }: { task: Task; role?: "advocate" | "client" }) {
  const [completed, setCompleted] = useState(task.status === "completed");
  const Icon = categoryIcon[task.category] ?? Clock;
  const d = daysLeft(task.dueDate);
  const urgent = d <= 1 && d >= 0 && !completed;
  const overdue = task.status === "overdue";

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    setCompleted((v) => !v);
  };

  return (
    <Link
      to={`/${role}/task/${task.id}`}
      className={cn(
        "group block glass-card p-5 hover:shadow-float hover:-translate-y-0.5 transition-calm relative overflow-hidden",
        completed && "opacity-70"
      )}
    >
      {urgent && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-ocean" />}
      <div className="flex items-start gap-4">
        <button
          onClick={toggle}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
          className={cn(
            "shrink-0 h-11 w-11 rounded-2xl border-2 flex items-center justify-center transition-calm relative",
            completed
              ? "bg-gradient-ocean border-transparent shadow-soft"
              : "border-border hover:border-primary hover:bg-secondary"
          )}
        >
          {completed ? (
            <Check className="h-5 w-5 text-primary-foreground animate-check-pop" strokeWidth={3} />
          ) : (
            <Icon className="h-5 w-5 text-primary" />
          )}
          {completed && <span className="absolute inset-0 rounded-2xl bg-primary/30 animate-ripple pointer-events-none" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className={cn("font-semibold text-foreground leading-snug", completed && "line-through text-muted-foreground")}>{task.title}</h3>
          </div>
          {task.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={completed ? "completed" : task.status} />
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full",
              overdue ? "bg-status-overdue/15 text-status-overdue" :
              urgent ? "bg-status-waiting/20 text-status-waiting-fg" :
              "bg-secondary text-secondary-foreground"
            )}>
              <Clock className="h-3 w-3" /> {countdownLabel(task.dueDate)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
