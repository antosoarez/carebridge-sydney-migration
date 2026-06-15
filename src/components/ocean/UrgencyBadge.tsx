import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { calculateUrgency, UrgencyResult, urgencyBadgeClasses } from "@/lib/urgency";
import { AlertCircle } from "lucide-react";

export function UrgencyBadge({ clientId, className }: { clientId: string; className?: string }) {
  const [result, setResult] = useState<UrgencyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    calculateUrgency(clientId).then((r) => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; };
  }, [clientId]);

  if (!result) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              urgencyBadgeClasses(result.level),
              className,
            )}
            aria-label={`Urgency ${result.level}, score ${result.score}`}
          >
            <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
            {result.level}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="font-semibold text-sm">Urgency: {result.level} ({result.score})</p>
            {result.signals.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active signals.</p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {result.signals.map((s, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{s.label}</span>
                    <span className="font-mono opacity-80">+{s.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
