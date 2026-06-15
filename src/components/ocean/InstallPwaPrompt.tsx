import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone, Share, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "carebridge.installPrompt.dismissedAt";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isSafari;
}

function wasRecentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const when = Number(v);
    if (!Number.isFinite(when)) return false;
    return Date.now() - when < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPwaPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [iosSheetOpen, setIosSheetOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIosSafari()) setShowIos(true);

    const installed = () => setDismissed(true);
    window.addEventListener("appinstalled", installed);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
    setIosSheetOpen(false);
  };

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted" || outcome === "dismissed") dismiss();
      setDeferred(null);
    } else if (showIos) {
      setIosSheetOpen(true);
    }
  };

  if (dismissed) return null;
  if (!deferred && !showIos) return null;

  return (
    <>
      <div
        className={cn(
          "fixed left-1/2 -translate-x-1/2 z-40 w-[min(92vw,420px)]",
          "bottom-20 md:bottom-6"
        )}
      >
        <div className="glass-card flex items-center gap-3 px-4 py-3 rounded-2xl shadow-soft border border-border/60 bg-card/95 backdrop-blur-xl animate-fade-in">
          <div className="h-10 w-10 rounded-2xl bg-gradient-ocean text-primary-foreground flex items-center justify-center shadow-soft shrink-0">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary-deep leading-tight">
              Add CareBridge to your home screen
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quick access, full screen — like an app.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleInstall}
            className="rounded-xl bg-gradient-ocean h-9 px-3 text-xs"
          >
            {deferred ? "Install" : "How"}
          </Button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground p-1 -mr-1 rounded-lg transition-calm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {iosSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-primary-deep/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4 animate-fade-in"
          onClick={() => setIosSheetOpen(false)}
        >
          <div
            className="bg-card rounded-3xl shadow-soft border border-border/60 max-w-sm w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl text-primary-deep">Add to Home Screen</h3>
            <p className="text-sm text-muted-foreground">Two gentle taps in Safari:</p>
            <ol className="space-y-3">
              <li className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full bg-secondary text-primary-deep font-semibold flex items-center justify-center text-sm shrink-0">1</span>
                <span className="text-sm flex items-center gap-1.5">Tap the <Share className="h-4 w-4 inline text-primary" /> <strong>Share</strong> button</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full bg-secondary text-primary-deep font-semibold flex items-center justify-center text-sm shrink-0">2</span>
                <span className="text-sm flex items-center gap-1.5">Choose <Plus className="h-4 w-4 inline text-primary" /> <strong>Add to Home Screen</strong></span>
              </li>
            </ol>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1 rounded-xl" onClick={() => setIosSheetOpen(false)}>Maybe later</Button>
              <Button className="flex-1 rounded-xl bg-gradient-ocean" onClick={dismiss}>Got it</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
