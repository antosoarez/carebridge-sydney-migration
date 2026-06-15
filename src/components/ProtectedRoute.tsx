import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, Role } from "@/lib/auth";
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
    if (!user) { setPwdCheck("ok"); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setPwdCheck(data?.must_change_password ? "needs" : "ok");
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (loading || mfaState === "checking" || pwdCheck === "checking") {
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

  if (requireRole && role !== requireRole) {
    return <Navigate to={role === "advocate" ? "/advocate" : "/client"} replace />;
  }

  return <>{children}</>;
}
