import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single shared anchor for bottom-right floating action buttons.
 * Children are stacked bottom-up (first child = bottom / primary).
 *
 * Automatic overflow handling:
 *  - "normal"  : default vertical column, full size
 *  - "compact" : children scale down (~85%) with tighter gap when vertical
 *                space is tight (short viewport or many children)
 *  - "wrap"    : if still overflowing, wrap into a horizontal row that
 *                grows leftward from the bottom-right corner so nothing
 *                gets clipped or pushed off-screen
 *
 * Recomputed on resize, orientation change, and when children mutate.
 */
type Mode = "normal" | "compact" | "wrap";

export function FloatingActionStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>("normal");

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const inner = innerRef.current;
    if (!wrapper || !inner) return;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Available vertical space from top of wrapper to viewport top.
        const rect = wrapper.getBoundingClientRect();
        const availableHeight = rect.bottom; // distance from viewport top to bottom of wrapper
        // Reset to natural size first to get true content height.
        const prevTransform = inner.style.transform;
        inner.style.transform = "none";
        const contentHeight = inner.scrollHeight;
        inner.style.transform = prevTransform;

        // Leave ~16px breathing room above viewport top.
        const safe = availableHeight - 16;

        if (contentHeight <= safe) {
          setMode("normal");
        } else if (contentHeight * 0.85 <= safe) {
          setMode("compact");
        } else {
          setMode("wrap");
        }
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [children]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "fixed right-4 md:right-6 z-40 pointer-events-none",
        "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6",
        // Cap the stack so it never reaches the top of the viewport.
        "max-h-[calc(100dvh-6rem)]",
        className
      )}
    >
      <div
        ref={innerRef}
        className={cn(
          "flex items-end origin-bottom-right transition-[transform,gap] duration-200 ease-out",
          mode === "wrap"
            ? "flex-row-reverse flex-wrap-reverse gap-2 max-w-[calc(100vw-2rem)] justify-end"
            : "flex-col-reverse gap-3",
          mode === "compact" && "scale-[0.85] gap-2"
        )}
      >
        {children}
      </div>
    </div>
  );
}
