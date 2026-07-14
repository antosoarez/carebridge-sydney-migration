import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import brandBanner from "@/assets/brand-banner.jpg";
import brandSignature from "@/assets/brand-signature.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, roleHomePath } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { SEO } from "@/components/SEO";
import { EmergencyNotice } from "@/components/ocean/EmergencyNotice";
import { getInviteAuthTokens, isInviteAuthCallback } from "@/lib/invite-routing";

export default function Welcome() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [waitedForSession, setWaitedForSession] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isInviteCallback, setIsInviteCallback] = useState(false);

  // Detect an invite-link error in the URL hash (expired / already used).
  const hashError = useMemo(() => {
    if (typeof window === "undefined") return null;
    const h = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!h) return null;
    const params = new URLSearchParams(h);
    const err = params.get("error") || params.get("error_code");
    const desc = params.get("error_description");
    return err || desc ? { err, desc } : null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsInviteCallback(isInviteAuthCallback(new URL(window.location.href)));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isInviteAuthCallback(new URL(window.location.href))) return;

    const tokens = getInviteAuthTokens(new URL(window.location.href));
    if (!tokens?.accessToken || !tokens.refreshToken) return;

    let active = true;
    (async () => {
      const { error } = await supabase.auth.setSession({
        access_token: tokens.accessToken!,
        refresh_token: tokens.refreshToken!,
      });
      if (!active) return;
      if (error) {
        console.error("Failed to hydrate invite session", error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Give supabase-js a moment to consume the invite token from the hash.
  useEffect(() => {
    const t = setTimeout(() => setWaitedForSession(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acknowledged) {
      toast({ title: "Please acknowledge to continue", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Please use at least 8 characters", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Those passwords don’t match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      try { await supabase.functions.invoke("mark-activated", { body: {} }); } catch { /* non-blocking */ }
      toast({ title: "Welcome aboard 🌊", description: "Your account is ready." });
      // Invited clients always get the 'client' role via handle_new_user trigger.
      navigate(role === "client" ? "/client/onboarding" : roleHomePath(role), { replace: true });
    } catch (err: any) {
      toast({ title: "Couldn't set password", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const linkBroken = !loading && !user && (hashError || (waitedForSession && !isInviteCallback));

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-sky">
      <SEO title="Set your password — CareBridge Perth" description="Set your password to finish joining CareBridge Perth." />
      <div className="w-full max-w-xl animate-fade-in">
        <img
          src={brandBanner}
          alt="CareBridge Perth — find clarity, prepare with confidence, be heard"
          className="w-full mb-8 rounded-3xl shadow-soft"
        />
        <EmergencyNotice className="mb-4" />
        <div className="glass-card p-8 shadow-float">
          {linkBroken ? (
            <>
              <h1 className="font-display text-3xl text-primary-deep">This invite link no longer works</h1>
              <p className="text-muted-foreground mt-3">
                This invite link has expired or was already used. Please ask your advocate to send a new one.
              </p>
              <Button
                onClick={() => navigate("/", { replace: true })}
                className="mt-6 h-12 rounded-2xl bg-gradient-ocean text-base font-semibold shadow-soft"
              >
                Back to sign in
              </Button>
            </>
          ) : !user ? (
            <p className="text-muted-foreground">Checking your invite link…</p>
          ) : (
            <>
              <h1 className="font-display text-3xl text-primary-deep">Welcome aboard</h1>
              <p className="text-muted-foreground mt-1">Before we begin — a few things to know about CareBridge.</p>

              <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5 space-y-3 text-sm leading-relaxed">
                <p className="font-semibold text-primary-deep">CareBridge is here to help you navigate the health system.</p>
                <ul className="list-disc pl-5 space-y-2 text-foreground/90">
                  <li>We are a <strong>health navigation and advocacy service</strong> — not a medical or clinical service.</li>
                  <li>We don't give medical advice, diagnosis, or treatment, and we don't replace your doctor.</li>
                  <li>We help you understand, organise, and advocate for your care — you stay in control of every decision.</li>
                  <li>In an emergency, always call <strong>000</strong>.</li>
                </ul>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded accent-primary shrink-0"
                  />
                  <span className="text-sm text-foreground/90 leading-relaxed">
                    I understand that CareBridge provides non-clinical health navigation and advocacy, does not provide medical advice or treatment, and does not replace my doctor or treating team. I understand that in an emergency I should call <strong>000</strong>.
                  </span>
                </label>

                <div className="space-y-2">
                  <Label>Your email</Label>
                  <Input
                    value={user.email ?? ""}
                    readOnly
                    disabled
                    className="h-12 rounded-2xl bg-muted/40 cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    You’re setting up this account. Contact your advocate if the email is wrong.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className="h-12 rounded-2xl bg-card" required />
                  <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} className="h-12 rounded-2xl bg-card" required />
                </div>
                <Button type="submit" disabled={submitting || !acknowledged} className="w-full h-12 rounded-2xl bg-gradient-ocean text-base font-semibold shadow-soft">
                  {submitting ? "Please wait…" : "Enter my space"}
                </Button>
              </form>
            </>
          )}
        </div>
        <div className="mt-8 flex flex-col items-center text-center gap-3">
          <img
            src={brandSignature}
            alt="Antonella — CareBridge Perth"
            className="max-w-[220px] w-full opacity-90"
          />
          <p className="text-sm text-muted-foreground">
            Need a hand?{" "}
            <a href="mailto:hello@carebridgeperth.com" className="text-primary-deep underline underline-offset-4">
              hello@carebridgeperth.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
