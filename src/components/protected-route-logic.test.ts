import { describe, expect, it } from "vitest";
import { getClientRouteRedirect } from "./protected-route-logic";

describe("getClientRouteRedirect", () => {
  it("redirects to onboarding while onboarding is pending", () => {
    expect(
      getClientRouteRedirect({
        requireRole: "client",
        onboardingCheck: "needs",
        gateTarget: "/client/payment",
        pathname: "/client",
        isInviteFlow: false,
      }),
    ).toBe("/client/onboarding");
  });

  it("does not redirect from onboarding pages while onboarding is pending", () => {
    expect(
      getClientRouteRedirect({
        requireRole: "client",
        onboardingCheck: "needs",
        gateTarget: "/client/payment",
        pathname: "/client/onboarding",
        isInviteFlow: false,
      }),
    ).toBeNull();
  });

  it("does not redirect from the current gate target", () => {
    expect(
      getClientRouteRedirect({
        requireRole: "client",
        onboardingCheck: "ok",
        gateTarget: "/client/payment",
        pathname: "/client/payment",
        isInviteFlow: false,
      }),
    ).toBeNull();
  });
});
