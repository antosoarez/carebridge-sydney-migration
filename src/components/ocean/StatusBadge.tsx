import { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const map: Record<TaskStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-status-pending text-status-pending-fg" },
  progress: { label: "In progress", cls: "bg-status-progress text-status-progress-fg" },
  waiting: { label: "Waiting reply", cls: "bg-status-waiting text-status-waiting-fg" },
  uploaded: { label: "Uploaded", cls: "bg-status-uploaded text-status-uploaded-fg" },
  completed: { label: "Completed", cls: "bg-status-completed text-status-completed-fg" },
  overdue: { label: "Needs attention", cls: "bg-status-overdue text-status-overdue-fg" },
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold", m.cls, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {m.label}
    </span>
  );
}
