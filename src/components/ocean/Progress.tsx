import { cn } from "@/lib/utils";

export function OceanProgress({ value, className, showLabel = false }: { value: number; className?: string; showLabel?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full progress-fill rounded-full transition-calm"
          style={{ width: `${v}%` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground font-medium">
          <span>Progress</span>
          <span>{v}%</span>
        </div>
      )}
    </div>
  );
}
