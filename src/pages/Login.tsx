import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/ocean/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, roleHomePath } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { SEO } from "@/components/SEO";
import { LifeBuoy } from "lucide-react";
import { verifyRecoveryCode } from "@/lib/recovery-codes";
import { isCurrentDeviceTrusted, trustCurrentDevice, TRUST_DURATION_DAYS } from "@/lib/trusted-device";
import { Checkbox } from "@/components/ui/checkbox";
import { isInviteAuthCallback } from "@/lib/invite-routing";

const SUPPORT_EMAIL = "hello@carebridgeperth.com";

export default function Login() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  // MFA challenge state
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = forgotEmail.trim();
    if (!target) return;
    setSendingReset(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: { email: target, redirect_to: `${window.location.origin}/reset-password` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Check your inbox 💌", description: "We've sent a link to reset your password." });
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err: any) {
      toast({ title: "Couldn't send reset email", description: err.message, variant: "destructive" });
    } finally {
      setSendingReset(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && isInviteAuthCallback(new URL(window.location.href))) {
      return;
    }

    if (!loading && user && !mfaFactorId) {
      if (!role) {
        navigate("/account-pending", { replace: true });
        return;
      }
      // Only redirect if MFA isn't pending
      supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(async ({ data }) => {
        const destination = roleHomePath(role);
        if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
          const trusted = await isCurrentDeviceTrusted();
          if (trusted) {
            navigate(destination, { replace: true });
            return;
          }
          supabase.auth.mfa.listFactors().then(({ data: f }) => {
            const verified = f?.totp?.find((t) => t.status === "verified");
            if (verified) setMfaFactorId(verified.id);
            else navigate(destination, { replace: true });
          });
        } else {
          navigate(destination, { replace: true });
        }
      });
    }
  }, [user, role, loading, navigate, mfaFactorId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Couldn't sign in", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId) return;
    setMfaSubmitting(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: ch.id,
        code: mfaCode.trim(),
      });
      if (vErr) throw vErr;
      if (trustDevice) {
        try { await trustCurrentDevice(); } catch { /* non-blocking */ }
      }
      toast({ title: "Verified ✓", description: trustDevice ? `Welcome back. We'll trust this device for ${TRUST_DURATION_DAYS} days.` : "Welcome back." });
      setMfaFactorId(null);
      setMfaCode("");
      navigate(roleHomePath(role), { replace: true });
    } catch (err: any) {
      toast({ title: "Invalid code", description: err.message, variant: "destructive" });
    } finally {
      setMfaSubmitting(false);
    }
  };

  const cancelMfa = async () => {
    setMfaFactorId(null);
    setMfaCode("");
    setRecoveryMode(false);
    setRecoveryCode("");
    await supabase.auth.signOut();
  };

  const useRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaSubmitting(true);
    try {
      await verifyRecoveryCode(recoveryCode);
      await supabase.auth.refreshSession();
      toast({
        title: "Recovery code accepted ✓",
        description: "Two-step verification was reset. Please set it up again from Settings.",
      });
      setMfaFactorId(null);
      setMfaCode("");
      setRecoveryMode(false);
      setRecoveryCode("");
      navigate(roleHomePath(role), { replace: true });
    } catch (err: any) {
      toast({ title: "Couldn't verify code", description: err.message, variant: "destructive" });
    } finally {
      setMfaSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <SEO title="Sign in" description="Sign in to CareBridge Perth — a calmer path through healthcare for advocates and their clients." />
      <section className="hidden lg:flex relative overflow-hidden bg-gradient-ocean p-12 text-primary-foreground flex-col justify-between">
        <Logo withText={false} className="relative z-10" />
        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-5xl leading-tight text-balance">A calmer path through healthcare.</h1>
          <p className="mt-5 text-primary-foreground/90 leading-relaxed text-lg">
            CareBridge Perth helps advocates and clients move through medical journeys together — gently, clearly, one calm step at a time.
          </p>
          <div className="mt-10 flex flex-col gap-3 text-sm">
            {["Soft reminders, never alarms", "One clear action at a time", "Secure, shared, simple"].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-primary-foreground/80" /> {t}
              </div>
            ))}
          </div>
        </div>
        <svg className="absolute bottom-0 left-0 right-0 text-primary-foreground/10 animate-wave-drift" viewBox="0 0 800 200" fill="currentColor" aria-hidden>
          <path d="M0 100 Q200 40 400 100 T800 100 V200 H0 Z" />
        </svg>
        <svg className="absolute bottom-0 left-0 right-0 text-primary-foreground/15" viewBox="0 0 800 200" fill="currentColor" aria-hidden>
          <path d="M0 140 Q200 90 400 140 T800 140 V200 H0 Z" />
        </svg>
      </section>

      <section className="flex items-center justify-center p-6 md:p-12 bg-gradient-sky">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden mb-8 flex justify-center"><Logo /></div>
          <div className="glass-card p-8 shadow-float">
            {mfaFactorId ? (
              recoveryMode ? (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display text-3xl text-primary-deep">Use a recovery code 🗝️</h2>
                    <p className="text-muted-foreground mt-1">
                      Enter one of the backup codes you saved when you set up two-step verification. Each code works once.
                    </p>
                  </div>
                  <form onSubmit={useRecovery} className="space-y-4">
                    <Input
                      autoFocus
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="XXXXX-XXXXX"
                      className="h-14 rounded-2xl bg-card text-center text-lg tracking-[0.25em] font-semibold uppercase"
                      required
                    />
                    <Button type="submit" disabled={mfaSubmitting || recoveryCode.replace(/[^A-Z0-9]/g, "").length < 10} className="w-full h-12 rounded-2xl bg-gradient-ocean">
                      {mfaSubmitting ? "Verifying…" : "Use recovery code"}
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => { setRecoveryMode(false); setRecoveryCode(""); }}>
                      Back to authenticator
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display text-3xl text-primary-deep">Two-step check 🔐</h2>
                    <p className="text-muted-foreground mt-1">Enter the 6-digit code from your authenticator app.</p>
                  </div>
                  <form onSubmit={verifyMfa} className="space-y-4">
                    <Input
                      autoFocus
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123 456"
                      className="h-14 rounded-2xl bg-card text-center text-2xl tracking-[0.5em] font-semibold"
                      required
                    />
                    <label className="flex items-center gap-3 p-3 rounded-2xl bg-secondary/40 cursor-pointer">
                      <Checkbox checked={trustDevice} onCheckedChange={(v) => setTrustDevice(v === true)} />
                      <span className="text-sm">
                        <span className="font-semibold text-primary-deep">Trust this device for {TRUST_DURATION_DAYS} days</span>
                        <span className="block text-xs text-muted-foreground">Skip the 6-digit code on this device. Don't tick on shared computers.</span>
                      </span>
                    </label>
                    <Button type="submit" disabled={mfaSubmitting || mfaCode.length !== 6} className="w-full h-12 rounded-2xl bg-gradient-ocean">
                      {mfaSubmitting ? "Verifying…" : "Verify"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setRecoveryMode(true)}
                      className="w-full text-sm font-semibold text-primary-deep hover:underline"
                    >
                      Lost your authenticator? Use a recovery code
                    </button>
                    <Button type="button" variant="ghost" className="w-full" onClick={cancelMfa}>
                      Cancel
                    </Button>
                  </form>
                </div>
              )
            ) : (
            <>
            <h2 className="font-display text-3xl text-primary-deep">Welcome back</h2>
            <p className="text-muted-foreground mt-1">Sign in to your space.</p>


            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-2xl bg-card" required />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {true && (
                    <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className="text-xs font-semibold text-primary-deep hover:underline">
                          Forgot password?
                        </button>
                      </DialogTrigger>
                      <DialogContent className="rounded-3xl">
                        <DialogHeader>
                          <DialogTitle className="font-display text-2xl text-primary-deep">Reset your password</DialogTitle>
                          <DialogDescription>
                            Pop in your email and we'll send a gentle link to set a new one.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={sendReset} className="space-y-4 mt-2">
                          <div className="space-y-2">
                            <Label htmlFor="forgot-email">Email</Label>
                            <Input
                              id="forgot-email"
                              type="email"
                              value={forgotEmail}
                              onChange={(e) => setForgotEmail(e.target.value)}
                              placeholder={email || "you@example.com"}
                              className="h-11 rounded-xl bg-card"
                              required
                            />
                          </div>
                          <DialogFooter className="gap-2 sm:gap-2">
                            <Button type="button" variant="ghost" onClick={() => setForgotOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={sendingReset || !forgotEmail.trim()} className="rounded-2xl bg-gradient-ocean">
                              {sendingReset ? "Sending…" : "Send reset link"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} className="h-12 rounded-2xl bg-card" required />
              </div>

              <Button type="submit" disabled={submitting} className="w-full h-13 py-6 rounded-2xl bg-gradient-ocean hover:opacity-90 text-base font-semibold shadow-soft hover:shadow-float transition-calm">
                {submitting ? "Please wait…" : "Continue to your space"}
              </Button>

              <p className="text-xs text-center text-muted-foreground pt-2">
                Client accounts are created by your advocate. If you've been invited, sign in with the credentials provided.
              </p>

              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=Need%20a%20hand%20with%20CareBridge%20Perth`}
                className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-primary-deep hover:underline"
              >
                <LifeBuoy className="h-4 w-4" /> Need a hand? Email {SUPPORT_EMAIL}
              </a>
            </form>
            </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
