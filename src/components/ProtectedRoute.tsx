import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, Role, roleHomePath } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentDeviceTrusted } from "@/lib/trusted-device";

interface Props {
  children: React.ReactNode;
  requireRole: Role;
}

export function ProtectedRoute({ children, requireRole }: Props) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const [mfaState, setMfaState] = useState<"checking" | "ok" | "needs">("checking");
  const [pwdCheck, setPwdCheck] = useState<"checking" | "ok" | "needs">("checking");
  const [onboardingCheck, setOnboardingCheck] = useState<"checking" | "ok" | "needs">("checking");
  // Journey gate: first unmet step's target path (null = full access / fail-open).
  const [gateTarget, setGateTarget] = useState<string | null>(null);
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    if (!user) { setMfaState("ok"); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
        const trusted = await isCurrentDeviceTrusted();
        if (cancelled) return;
        if (trusted) { setMfaState("ok"); return; }
        await supabase.auth.signOut();
        if (!cancelled) setMfaState("needs");
      } else {
        setMfaState("ok");
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 1. Extraemos el ID como una variable primitiva (string o undefined) antes del efecto
  const userId = user?.id;

  useEffect(() => {
    // 2. Evaluamos usando userId en lugar del objeto user completo
    if (!userId) { 
      setPwdCheck("ok"); 
      setOnboardingCheck("ok"); 
      setGateChecked(true); 
      return; 
    }
    
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase
        .from("profiles") as any)
        .select("must_change_password, onboarding_completed_at, gating_override, agreements_completed_at, payment_completed_at, consultation_booked_at, intake_completed_at")
        .eq("id", userId) // 3. Usamos la variable primitiva aquí
        .maybeSingle();
        
      if (cancelled) return;
      setPwdCheck(data?.must_change_password ? "needs" : "ok");
      setOnboardingCheck(data?.onboarding_completed_at ? "ok" : "needs");

      // Journey gate: fail OPEN on any error or missing row (never lock out).
      if (error || !data || data.gating_override) { setGateTarget(null); setGateChecked(true); return; }
      
      const steps: Array<{ done: boolean; target: string }> = [
        { done: !!data.payment_completed_at, target: "/client/payment" },
        { done: !!data.agreements_completed_at, target: "/client/agreements" },
        { done: !!data.intake_completed_at, target: "/client/intake-form" },
      ];
      
      const firstUnmet = steps.find((s) => !s.done);
      setGateTarget(firstUnmet ? firstUnmet.target : null);
      setGateChecked(true);
    })();
    
    return () => { cancelled = true; };
  }, [userId]); // 4. El array ahora solo depende de nuestro string primitivo

  if (loading || mfaState === "checking" || pwdCheck === "checking" || onboardingCheck === "checking" || !gateChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-sky">
        <div className="text-muted-foreground">Loading your space…</div>
      </div>
    );
  }

  if (!user || mfaState === "needs") return <Navigate to="/" replace />;

  if (pwdCheck === "needs" && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Solo navega si NO está ya en account-pending
  if (!role && location.pathname !== "/account-pending") {
    return <Navigate to="/account-pending" replace />;
  }

  // Solo navega si NO está ya en el home de su rol correspondiente
  if (requireRole && role !== requireRole && location.pathname !== roleHomePath(role)) {
    return <Navigate to={roleHomePath(role)} replace />;
  }

  // Gate clients who haven't finished onboarding. Allow the onboarding route
  // itself (and its sub-steps like /client/navigation-intake) through.
  if (
    requireRole === "client" &&
    onboardingCheck === "needs" &&
    !location.pathname.startsWith("/client/onboarding") &&
    !location.pathname.startsWith("/client/navigation-intake") &&
    !location.pathname.startsWith("/client/agreements")
  ) {
    return <Navigate to="/client/onboarding" replace />;
  }

  // Journey gate: enforce agreements → payment → booking → health intake order.
  // Escape hatches always render (never lock the client out): the gate targets
  // themselves, settings, support, the safety check-in page, and password change.
  if (requireRole === "client" && gateTarget) {
    const path = location.pathname;
    const alwaysAllowed =
      path.startsWith("/client/onboarding") ||
      path.startsWith("/client/navigation-intake") ||
      path.startsWith("/client/agreements") ||
      path.startsWith("/client/settings") ||
      path.startsWith("/client/support") ||
      path.startsWith("/client/payment") ||
      path.startsWith("/book-appointment") ||
      path.startsWith("/client/intake-form") ||
      path.startsWith("/client/check-in") ||
      path.startsWith("/check-in") ||
      path === "/change-password";
    if (!alwaysAllowed && path !== gateTarget) {
      return <Navigate to={gateTarget} replace />;
    }
  }

  return <>{children}</>;
}
