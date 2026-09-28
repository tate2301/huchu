import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccessContext } from "@/lib/auth-core/access";
import type { AuthenticatedSession } from "@/lib/auth-core/types";

const ADMIN_HOST = "portal.admin.pagka.dev";
const PLATFORM_EMAIL = "platform@pagka.dev";

// Every tenant's owner is SUPERADMIN — provisionTenant and self-serve signup
// both hand it out — so this is the shape of a stranger who signed up.
function superadmin(email: string, role = "SUPERADMIN"): AuthenticatedSession {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: "user-1",
      email,
      role,
      companyId: "company-1",
      tenantStatus: "ACTIVE",
      authExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  } as AuthenticatedSession;
}

// The options requireAdminPortalSession and requirePlatformAdminAccess use.
function resolveAdmin(session: AuthenticatedSession, hostHeader = ADMIN_HOST) {
  return resolveAccessContext({
    session,
    hostHeader,
    pathname: "/api/platform-admin/companies",
    requireAdmin: true,
    requireTenantContext: false,
    enforceRouteFeatureCheck: false,
    enforceTenantHost: false,
  });
}

describe("resolveAccessContext with requireAdmin", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_PORTAL_HOST", ADMIN_HOST);
    vi.stubEnv("ADMIN_ROOT_DOMAIN", "admin.pagka.dev");
    vi.stubEnv("ADMIN_PORTAL_ALLOWED_EMAILS", PLATFORM_EMAIL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a tenant SUPERADMIN whose email is not allow-listed", async () => {
    const result = await resolveAdmin(superadmin("owner@signed-up.example"));
    expect(result).toMatchObject({ ok: false, reason: "SUPERUSER_REQUIRED", status: 403 });
  });

  it("refuses them on localhost too, which counts as the admin host in development", async () => {
    const result = await resolveAdmin(superadmin("owner@signed-up.example"), "localhost:3100");
    expect(result).toMatchObject({ ok: false, reason: "SUPERUSER_REQUIRED", status: 403 });
  });

  it("allows the allow-listed superuser, whatever the email's case", async () => {
    const result = await resolveAdmin(superadmin("Platform@Pagka.dev"));
    expect(result.ok).toBe(true);
  });

  it("refuses an allow-listed email that does not hold SUPERADMIN", async () => {
    const result = await resolveAdmin(superadmin(PLATFORM_EMAIL, "MANAGER"));
    expect(result).toMatchObject({ ok: false, reason: "SUPERUSER_REQUIRED" });
  });

  it("refuses an address once it is taken off the list", async () => {
    vi.stubEnv("ADMIN_PORTAL_ALLOWED_EMAILS", "someone-else@pagka.dev");
    const result = await resolveAdmin(superadmin(PLATFORM_EMAIL));
    expect(result).toMatchObject({ ok: false, reason: "SUPERUSER_REQUIRED" });
  });
});
