import { cn } from "@/lib/utils";

/**
 * CareBridge Perth logo lockup.
 * The square on the left is a placeholder slot for the uploaded logo file.
 * Drop the image at /public/logo.png (or update the <img src>) and it will
 * appear in the header and sidebar everywhere the <Logo /> is used.
 */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative h-11 w-11 rounded-2xl bg-card border border-border shadow-soft flex items-center justify-center overflow-hidden">
        {/* Logo placeholder — replace src with uploaded logo */}
        <img
          src="/logo.png"
          alt="CareBridge Perth logo"
          className="h-full w-full object-contain p-1"
          onError={(e) => {
            // Fallback monogram if no logo uploaded yet
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div
          className="absolute inset-0 hidden items-center justify-center bg-gradient-ocean text-primary-foreground"
          aria-hidden
        >
          <span className="font-display text-lg font-semibold">CB</span>
        </div>
      </div>
      {withText && (
        <div className="leading-tight">
          <div className="font-display text-xl font-semibold text-primary-deep">CareBridge Perth</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Calm Care</div>
        </div>
      )}
    </div>
  );
}
