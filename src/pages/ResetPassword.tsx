import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/ocean/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { SEO } from "@/components/SEO";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash and creates a session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Please use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated 💙", description: "You can sign in with your new password." });
      await supabase.auth.signOut();
      navigate("/", { replace: true });
    } catch (err: any) {
      toast({ title: "Couldn't update password", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-sky">
      <SEO title="Reset password" description="Set a new password for your CareBridge Perth account." />
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass-card p-8 shadow-float">
          <h1 className="font-display text-3xl text-primary-deep">Set a new password</h1>
          <p className="text-muted-foreground mt-1">
            {ready ? "Pick something gentle and memorable." : "Checking your reset link…"}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className="h-12 rounded-2xl bg-card" required disabled={!ready} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} className="h-12 rounded-2xl bg-card" required disabled={!ready} />
            </div>
            <Button type="submit" disabled={!ready || submitting} className="w-full py-6 rounded-2xl bg-gradient-ocean hover:opacity-90 text-base font-semibold shadow-soft hover:shadow-float transition-calm">
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
