import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  isPushSupported,
  getPermission,
  subscribeAndStore,
  unsubscribeLocally,
} from "@/lib/push-subscription";

type Prefs = {
  email_on_new_message: boolean;
  push_on_new_message: boolean;
  inapp_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
};

const DEFAULTS: Prefs = {
  email_on_new_message: true,
  push_on_new_message: false,
  inapp_enabled: true,
  quiet_hours_enabled: true,
  quiet_start: "22:00",
  quiet_end: "07:00",
};

function trimTime(t: string | null | undefined) {
  if (!t) return "00:00";
  return t.slice(0, 5);
}

export function NotificationSettingsCard() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [pushSupported, setPushSupported] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
    setPermission(getPermission());
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("notification_settings")
        .select("email_on_new_message, push_on_new_message, inapp_enabled, quiet_hours_enabled, quiet_start, quiet_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setPrefs({
          email_on_new_message: data.email_on_new_message,
          push_on_new_message: data.push_on_new_message ?? false,
          inapp_enabled: data.inapp_enabled ?? true,
          quiet_hours_enabled: data.quiet_hours_enabled,
          quiet_start: trimTime(data.quiet_start),
          quiet_end: trimTime(data.quiet_end),
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function save(next: Prefs) {
    if (!user) return;
    setPrefs(next);
    const { error } = await supabase
      .from("notification_settings")
      .upsert(
        {
          user_id: user.id,
          email_on_new_message: next.email_on_new_message,
          push_on_new_message: next.push_on_new_message,
          inapp_enabled: next.inapp_enabled,
          quiet_hours_enabled: next.quiet_hours_enabled,
          quiet_start: next.quiet_start,
          quiet_end: next.quiet_end,
        },
        { onConflict: "user_id" }
      );
    if (error) {
      toast({
        title: "Couldn't save",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function togglePush(on: boolean) {
    if (!user) return;
    if (!on) {
      await save({ ...prefs, push_on_new_message: false });
      await unsubscribeLocally();
      return;
    }
    // Turning on — need permission + subscription
    const res = await subscribeAndStore(user.id);
    if (res.ok) {
      setPermission("granted");
      await save({ ...prefs, push_on_new_message: true });
      toast({ title: "Notifications on", description: "We'll send a soft ping for new messages." });
    } else if (!res.ok && res.reason === "denied") {
      setPermission("denied");
      toast({
        title: "Notifications blocked",
        description: "Your browser has blocked notifications for this site.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Couldn't enable notifications",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
  }

  const pushDenied = pushSupported && permission === "denied";

  return (
    <section className="glass-card p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl text-primary-deep">Message notifications</h2>
        <p className="text-xs text-muted-foreground mt-1">
          During quiet hours, emails and pings wait. In-app alerts still appear.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Email me when I have new messages</p>
          <p className="text-xs text-muted-foreground">A calm note when something's waiting for you.</p>
        </div>
        <Switch
          checked={prefs.email_on_new_message}
          disabled={loading}
          onCheckedChange={(v) => save({ ...prefs, email_on_new_message: v })}
          aria-label="Email me when I have new messages"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Show in-app notifications</p>
          <p className="text-xs text-muted-foreground">Gentle updates in the bell at the top of the page.</p>
        </div>
        <Switch
          checked={prefs.inapp_enabled}
          disabled={loading}
          onCheckedChange={(v) => save({ ...prefs, inapp_enabled: v })}
          aria-label="Show in-app notifications"
        />
      </div>



      {pushSupported && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Send a soft notification to my device</p>
              <p className="text-xs text-muted-foreground">
                A gentle ping on this device, even when CareBridge is closed.
              </p>
            </div>
            <Switch
              checked={prefs.push_on_new_message && permission === "granted"}
              disabled={loading || pushDenied}
              onCheckedChange={togglePush}
              aria-label="Send a soft notification to my device"
            />
          </div>
          {pushDenied && (
            <p className="text-xs text-muted-foreground pl-0.5">
              Your browser has blocked notifications. To enable, please update your browser
              settings for this site.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Quiet hours</p>
          <p className="text-xs text-muted-foreground">No emails or pings during this window.</p>
        </div>
        <Switch
          checked={prefs.quiet_hours_enabled}
          disabled={loading}
          onCheckedChange={(v) => save({ ...prefs, quiet_hours_enabled: v })}
          aria-label="Quiet hours"
        />
      </div>

      {prefs.quiet_hours_enabled && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="quiet-start" className="text-xs text-muted-foreground">Start</Label>
            <Input
              id="quiet-start"
              type="time"
              value={prefs.quiet_start}
              disabled={loading}
              onChange={(e) => setPrefs({ ...prefs, quiet_start: e.target.value })}
              onBlur={() => save(prefs)}
              className="h-11 rounded-xl bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiet-end" className="text-xs text-muted-foreground">End</Label>
            <Input
              id="quiet-end"
              type="time"
              value={prefs.quiet_end}
              disabled={loading}
              onChange={(e) => setPrefs({ ...prefs, quiet_end: e.target.value })}
              onBlur={() => save(prefs)}
              className="h-11 rounded-xl bg-card"
            />
          </div>
        </div>
      )}
    </section>
  );
}
