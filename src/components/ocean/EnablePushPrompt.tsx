import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isPushSupported,
  isPreviewContext,
  getPermission,
  currentEndpoint,
  subscribeAndStore,
} from "@/lib/push-subscription";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

const SNOOZE_KEY = "carebridge.pushPrompt.snoozedAt";
const SNOOZE_DAYS = 7;

function snoozed(): boolean {
  try {
    const v = localStorage.getItem(SNOOZE_KEY);
    if (!v) return false;
    const when = Number(v);
    if (!Number.isFinite(when)) return false;
    return Date.now() - when < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function EnablePushPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isPushSupported()) return;
    if (isPreviewContext()) return;
    if (snoozed()) return;
    let cancelled = false;
    (async () => {
      const perm = getPermission();
      if (perm !== "default") return; // already granted or denied — don't ask
      // Don't ask if the user is already subscribed on this device
      const ep = await currentEndpoint();
      if (ep) return;
      // Don't ask if they've already enabled push at the account level
      const { data } = await supabase
        .from("notification_settings")
        .select("push_on_new_message")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.push_on_new_message) return;
      setVisible(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const dismiss = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  const enable = async () => {
    if (!user) return;
    setBusy(true);
    const res = await subscribeAndStore(user.id);
    setBusy(false);
    if (res.ok) {
      await supabase
        .from("notification_settings")
        .upsert({ user_id: user.id, push_on_new_message: true }, { onConflict: "user_id" });
      toast({
        title: "Notifications on",
        description: "We'll send a soft ping when a new message arrives.",
      });
      setVisible(false);
      return;
    }
    if (res.reason === "denied") {
      try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
      setVisible(false);
      return;
    }
    const reasonText: Record<string, string> = {
      unsupported: "This browser doesn't support push notifications.",
      "no-sw": "Service worker unavailable. Try reloading the page.",
      "no-vapid": "Push isn't configured on the server yet.",
      error: res.detail || "Something went wrong. Try again from Settings.",
    };
    toast({
      title: "Couldn't enable notifications",
      description: reasonText[res.reason ?? "error"] ?? "You can try again later from Settings.",
      variant: "destructive",
    });
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-40 w-[min(92vw,440px)]",
        "bottom-20 md:bottom-6"
      )}
    >
      <div className="glass-card rounded-2xl shadow-soft border border-border/60 bg-card/95 backdrop-blur-xl animate-fade-in p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-ocean text-primary-foreground flex items-center justify-center shadow-soft shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary-deep leading-snug">
              Would you like a soft notification when you have a new message?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              You can turn this off anytime.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1 rounded-lg transition-calm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 pl-[3.25rem]">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl h-9 px-3 text-xs"
            onClick={dismiss}
            disabled={busy}
          >
            Not now
          </Button>
          <Button
            size="sm"
            className="rounded-xl bg-gradient-ocean h-9 px-4 text-xs"
            onClick={enable}
            disabled={busy}
          >
            {busy ? "Enabling…" : "Yes, enable"}
          </Button>
        </div>
      </div>
    </div>
  );
}
