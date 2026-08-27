import { describe, expect, it } from "vitest";
import { tokenToSession } from "@/lib/auth-core/token-session";
import type { PlatformJwtClaims } from "@/lib/auth-core/types";

const baseToken: PlatformJwtClaims = {
  id: "user-1",
  name: "Chris",
  email: "chris@example.com",
  role: "MANAGER",
  companyId: "company-1",
  authStrategy: "credentials",
  sessionPolicy: "remember",
  authExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  rememberMe: true,
  companySlug: "acme",
  tenantStatus: "ACTIVE",
  workspaceProfile: "GENERAL",
  enabledFeatures: ["crm.customers"],
  subscriptionHealth: "OK",
  allowedHosts: ["acme.example.com"],
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("tokenToSession", () => {
  it("maps every claim applyTokenToSessionClaims maps", () => {
    const session = tokenToSession(baseToken);
    expect(session.user).toMatchObject({
      id: "user-1",
      name: "Chris",
      email: "chris@example.com",
      role: "MANAGER",
      companyId: "company-1",
      authStrategy: "credentials",
      sessionPolicy: "remember",
      rememberMe: true,
      companySlug: "acme",
      tenantStatus: "ACTIVE",
      workspaceProfile: "GENERAL",
      enabledFeatures: ["crm.customers"],
      subscriptionHealth: "OK",
      allowedHosts: ["acme.example.com"],
    });
    expect(session.user.authExpiresAt).toBe(baseToken.authExpiresAt);
  });

  it("derives expires from the token exp claim", () => {
    const session = tokenToSession(baseToken);
    expect(session.expires).toBe(
      new Date((baseToken.exp as number) * 1000).toISOString(),
    );
  });

  it("tolerates minimal tokens", () => {
    const session = tokenToSession({ id: "u" } as PlatformJwtClaims);
    expect(session.user.id).toBe("u");
    expect(session.user.role).toBe("");
    expect(session.user.companyId).toBe("");
    expect(session.user.enabledFeatures).toBeUndefined();
  });
});
