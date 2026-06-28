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

  useEffect(() => {
    if (!user) { setPwdCheck("ok"); setOnboardingCheck("ok"); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase
        .from("profiles") as any)
        .select("must_change_password, onboarding_completed_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setPwdCheck(data?.must_change_password ? "needs" : "ok");
      setOnboardingCheck(data?.onboarding_completed_at ? "ok" : "needs");
    })();
    return () => { cancelled = true; };
  }, [user, location.pathname]);

  if (loading || mfaState === "checking" || pwdCheck === "checking" || onboardingCheck === "checking") {
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

  if (!role) {
    return <Navigate to="/account-pending" replace />;
  }

  if (requireRole && role !== requireRole) {
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

  return <>{children}</>;
}
