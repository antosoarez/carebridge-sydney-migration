import { useEffect, useState } from "react";
import { AppShell } from "@/components/ocean/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Mail, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MfaSection } from "@/components/ocean/MfaSection";
import { EmailChangeSection } from "@/components/ocean/EmailChangeSection";
import { NotificationSettingsCard } from "@/components/ocean/NotificationSettingsCard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const role = window.location.pathname.startsWith("/advocate") ? "advocate" : "client";
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    // Prefer the profiles table (source of truth) and fall back to auth metadata
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setFullName(
        (data?.full_name as string | null) ??
          ((user.user_metadata?.full_name as string | undefined) ?? "")
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const trimmed = fullName.trim();
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: trimmed })
        .eq("id", user.id);
      if (profileError) throw profileError;

      // Keep auth metadata in sync so greetings everywhere reflect the new name
      const { error: metaError } = await supabase.auth.updateUser({
        data: { full_name: trimmed },
      });
      if (metaError) throw metaError;

      toast({ title: "Saved 🌊", description: "Your name has been updated." });
    } catch (err: any) {
      toast({
        title: "Couldn't save",
        description: err?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell role={role} title="Settings" subtitle="Make CareBridge Perth feel like yours.">
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="glass-card p-6 space-y-4">
          <h2 className="font-display text-xl text-primary-deep">Profile</h2>
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              className="h-11 rounded-xl bg-card"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            {user && (
              <EmailChangeSection
                targetUserId={user.id}
                currentEmail={email}
                mode="self"
              />
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !user}
            className="rounded-2xl bg-gradient-ocean h-11 mt-2"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </section>

        <NotificationSettingsCard />

        <MfaSection />

        {role === "advocate" && (
          <section className="glass-card p-6 lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent" />
              <h2 className="font-display text-xl text-primary-deep">Email templates</h2>
            </div>
            <div className="p-6 rounded-2xl bg-secondary/40 text-center">
              <p className="font-semibold text-primary-deep">No templates yet</p>
              <p className="text-xs text-muted-foreground mt-1">Reusable email drafts will appear here.</p>
              <Button disabled className="mt-4 rounded-2xl opacity-60">Create a template — coming soon</Button>
            </div>
          </section>
        )}

        <section className="glass-card p-6 lg:col-span-2 space-y-3">
          <h2 className="font-display text-xl text-primary-deep">Account</h2>
          <p className="text-xs text-muted-foreground">Sign out of CareBridge Perth on this device.</p>
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="rounded-2xl h-11 gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
