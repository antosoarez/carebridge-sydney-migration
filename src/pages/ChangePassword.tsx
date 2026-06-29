import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/ocean/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, roleHomePath } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { SEO } from "@/components/SEO";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { role, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
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
      const { error: actErr } = await supabase.functions.invoke("mark-activated", { body: {} });
      if (actErr) throw actErr;
      toast({ title: "Password updated 💙", description: "Welcome aboard." });
      navigate(roleHomePath(role), { replace: true });
    } catch (err: any) {
      toast({ title: "Couldn't update password", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-sky">
      <SEO title="Set a new password" description="Set your own password to continue." />
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass-card p-8 shadow-float">
          <h1 className="font-display text-3xl text-primary-deep">Set your own password</h1>
          <p className="text-muted-foreground mt-1">
            For your security, please replace the starting password your advocate gave you.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className="h-12 rounded-2xl bg-card" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} className="h-12 rounded-2xl bg-card" required />
            </div>
            <Button type="submit" disabled={submitting} className="w-full py-6 rounded-2xl bg-gradient-ocean text-base font-semibold shadow-soft">
              {submitting ? "Updating…" : "Save and continue"}
            </Button>
            <button type="button" onClick={() => { signOut(); navigate("/", { replace: true }); }} className="w-full text-sm text-muted-foreground hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
