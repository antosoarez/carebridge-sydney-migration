import { describe, expect, it } from "vitest";
import { isInviteAuthCallback } from "./invite-routing";

describe("isInviteAuthCallback", () => {
  it("detects Supabase invite callbacks from the hash", () => {
    const url = new URL("https://example.com/#access_token=abc&type=invite");
    expect(isInviteAuthCallback(url)).toBe(true);
  });

  it("detects Supabase invite callbacks from query parameters", () => {
    const url = new URL("https://example.com/?token=abc&type=invite&redirect_to=https://www.client.carebridgeperth.com");
    expect(isInviteAuthCallback(url)).toBe(true);
  });

  it("does not treat a normal login route as an invite callback", () => {
    const url = new URL("https://example.com/");
    expect(isInviteAuthCallback(url)).toBe(false);
  });
});
