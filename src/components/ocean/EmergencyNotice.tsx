import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Non-emergency disclaimer banner.
 * CareBridge is not an emergency service — in a crisis, users should call 000
 * (or Lifeline 13 11 14 in Australia).
 */
export function EmergencyNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      role="note"
      aria-label="Non-emergency notice"
      className={cn(
        "rounded-2xl border border-destructive/30 bg-destructive/5 text-foreground",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
        "flex items-start gap-2",
        className,
      )}
    >
      <AlertTriangle className={cn("text-destructive shrink-0 mt-0.5", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <p className="leading-snug">
        <strong className="font-semibold">Not for emergencies.</strong>{" "}
        CareBridge is not a crisis service. If you or someone else is in danger, call{" "}
        <a href="tel:000" className="underline underline-offset-2 font-semibold">000</a>{" "}
        or contact Lifeline on{" "}
        <a href="tel:131114" className="underline underline-offset-2 font-semibold">13 11 14</a>.
      </p>
    </div>
  );
}
