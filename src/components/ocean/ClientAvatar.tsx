import { cn } from "@/lib/utils";
import { CLIENT_COLOURS, ClientColourKey } from "@/lib/types";

export function ClientAvatar({
  name,
  gradient,
  colourKey,
  size = "md",
}: {
  name: string;
  gradient: string;
  colourKey?: ClientColourKey;
  size?: "sm" | "md" | "lg";
}) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("");
  const sz = size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm";

  if (colourKey && CLIENT_COLOURS[colourKey]) {
    const c = CLIENT_COLOURS[colourKey];
    return (
      <div
        className={cn("rounded-2xl flex items-center justify-center font-display font-semibold shadow-soft shrink-0", sz)}
        style={{ backgroundColor: c.bg, color: c.text }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl bg-gradient-to-br flex items-center justify-center font-display font-semibold text-primary-foreground shadow-soft shrink-0", gradient, sz)}>
      {initials}
    </div>
  );
}
