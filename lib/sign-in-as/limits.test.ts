import { describe, expect, it } from "vitest";

import { signInAsRefusal, type SignInAsClaim } from "@/lib/sign-in-as/limits";

const look: SignInAsClaim = { id: "s", number: 214, operatorName: "Farai", mode: "LOOK", until: "2026-10-13T12:32:00Z" };
const change: SignInAsClaim = { ...look, mode: "CHANGE" };

describe("what signing in as a member allows", () => {
  it("lets a member's own session through untouched", () => {
    expect(signInAsRefusal(undefined, "POST", "/api/v2/crm/deals")).toBeNull();
  });

  it("reads anything, in either mode", () => {
    expect(signInAsRefusal(look, "GET", "/api/v2/crm/deals")).toBeNull();
    expect(signInAsRefusal(change, "HEAD", "/api/preferences/password")).toBeNull();
  });

  it("refuses every write when looking only", () => {
    expect(signInAsRefusal(look, "POST", "/api/v2/crm/deals")).toMatch(/look only/);
    expect(signInAsRefusal(look, "DELETE", "/api/employees/1")).toMatch(/look only/);
  });

  it("refuses the member's password, email and payment method when making changes", () => {
    expect(signInAsRefusal(change, "POST", "/api/v2/crm/deals")).toBeNull();
    expect(signInAsRefusal(change, "PATCH", "/api/preferences/password")).toMatch(/password, email or payment/);
    expect(signInAsRefusal(change, "PATCH", "/api/preferences/profile")).toMatch(/password/);
    expect(signInAsRefusal(change, "POST", "/api/preferences/billing")).toMatch(/payment/);
    expect(signInAsRefusal(change, "POST", "/api/users/password-reset")).toMatch(/password/);
  });

  it("always lets the session be ended", () => {
    expect(signInAsRefusal(look, "POST", "/api/sign-in-as/end")).toBeNull();
  });
});
