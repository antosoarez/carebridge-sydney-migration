import { useEffect, useRef } from "react";

/**
 * Plays a soft two-tone sine chime. Safe to call anywhere — if the browser
 * blocks audio before the user has interacted with the page, the failure
 * is swallowed silently (no console noise, no thrown error).
 */
export function playSoftChime(): void {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tones = [880, 1320]; // soft two-note chime
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      const end = start + 0.35;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* silent — autoplay may block before first user interaction */
  }
}

/**
 * Watches `unread`. Maintains a document-title badge like `(3) CareBridge…`.
 * The audible chime is no longer fired here — it's now coupled to the
 * in-app toast (see useNewMessageToasts) so it suppresses naturally when
 * the toast is suppressed.
 */
export function useMessageChime(unread: number) {
  const baseTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "");

  // Capture clean base title once.
  useEffect(() => {
    const t = document.title.replace(/^\(\d+\+?\)\s*/, "");
    baseTitleRef.current = t;
  }, []);

  // Update title with badge.
  useEffect(() => {
    const base = baseTitleRef.current || "CareBridge Perth";
    document.title = unread > 0 ? `(${unread > 9 ? "9+" : unread}) ${base}` : base;
  }, [unread]);
}
