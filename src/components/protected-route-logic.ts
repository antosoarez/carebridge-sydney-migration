export interface ClientRouteRedirectParams {
  requireRole: string;
  onboardingCheck: "checking" | "ok" | "needs";
  gateTarget: string | null;
  pathname: string;
  isInviteFlow: boolean;
}

export function getClientRouteRedirect({
  requireRole,
  onboardingCheck,
  gateTarget,
  pathname,
  isInviteFlow,
}: ClientRouteRedirectParams): string | null {
  if (requireRole !== "client") {
    return null;
  }

  if (
    onboardingCheck === "needs" &&
    !isInviteFlow &&
    !pathname.startsWith("/client/onboarding") &&
    !pathname.startsWith("/client/navigation-intake") &&
    !pathname.startsWith("/client/agreements")
  ) {
    return "/client/onboarding";
  }

  if (onboardingCheck !== "ok" || !gateTarget) {
    return null;
  }

  const alwaysAllowed =
    pathname.startsWith("/client/onboarding") ||
    pathname.startsWith("/client/navigation-intake") ||
    pathname.startsWith("/client/agreements") ||
    pathname.startsWith("/client/settings") ||
    pathname.startsWith("/client/support") ||
    pathname.startsWith("/client/payment") ||
    pathname.startsWith("/book-appointment") ||
    pathname.startsWith("/client/intake-form") ||
    pathname.startsWith("/client/check-in") ||
    pathname.startsWith("/check-in") ||
    pathname === "/change-password";

  return alwaysAllowed || pathname === gateTarget ? null : gateTarget;
}
