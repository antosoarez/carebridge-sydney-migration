import { Heart } from "lucide-react";

function caption(pct: number): string {
  if (pct <= 0) return "Ready when you are";
  if (pct <= 25) return "Off to a gentle start";
  if (pct <= 50) return "Showing up nicely";
  if (pct <= 75) return "Wonderful momentum";
  return "Beautifully engaged";
}

interface Props {
  value: number;
  variant?: "primary" | "secondary";
  title?: string;
  subtitle?: string;
  readOnlyNote?: string;
}

export function ClientEngagementBar({
  value,
  variant = "primary",
  title = "Your progress",
  subtitle,
  readOnlyNote,
}: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const isSecondary = variant === "secondary";

  return (
    <section
      className={`glass-card ${isSecondary ? "p-4" : "p-6"}`}
      aria-label={title}
    >
      <div className="flex items-center gap-2 mb-3">
        <Heart className={`${isSecondary ? "h-3.5 w-3.5" : "h-4 w-4"} text-accent`} />
        <h3
          className={`font-display ${isSecondary ? "text-base" : "text-xl"} text-primary-deep`}
        >
          {title}
        </h3>
        {readOnlyNote && (
          <span className="ml-auto text-xs text-muted-foreground">{readOnlyNote}</span>
        )}
      </div>

      <div
        className={`${isSecondary ? "h-2" : "h-3"} w-full rounded-full overflow-hidden`}
        style={{
          backgroundColor: "hsl(155 30% 92%)",
          boxShadow: "inset 0 1px 2px hsl(155 25% 80% / 0.45)",
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, hsl(155 45% 78%), hsl(180 40% 65%))",
          }}
        />
      </div>

      <p className={`mt-2 ${isSecondary ? "text-xs" : "text-sm"} text-primary-deep`}>
        <span className="font-semibold">{pct}%</span>
        <span className="text-muted-foreground"> — {caption(pct)}</span>
      </p>

      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </section>
  );
}
