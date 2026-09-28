import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import { NextRequest, type NextFetchEvent } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";
import proxy from "@/proxy";

const ADMIN_HOST = "portal.admin.pagka.dev";
const PLATFORM_EMAIL = "platform@pagka.dev";
const SECRET = "proxy-test-secret";

// Runs the real proxy, withAuth and all, against a signed session cookie.
async function requestAs(pathname: string, email: string) {
  const sessionToken = await encode({
    secret: SECRET,
    token: {
      sub: "user-1",
      id: "user-1",
      email,
      // Every tenant's owner holds this role.
      role: "SUPERADMIN",
      companyId: "company-1",
      tenantStatus: "ACTIVE",
      authExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  const request = new NextRequest(`http://${ADMIN_HOST}${pathname}`, {
    headers: { host: ADMIN_HOST, cookie: `next-auth.session-token=${sessionToken}` },
  });
  const response = await proxy(request as NextRequestWithAuth, {} as NextFetchEvent);
  if (!response) throw new Error("proxy returned no response");
  return response;
}

describe("proxy on the admin host", () => {
  beforeEach(() => {
    vi.stubEnv("NEXTAUTH_SECRET", SECRET);
    vi.stubEnv("NEXTAUTH_URL", `http://${ADMIN_HOST}`);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("ADMIN_PORTAL_HOST", ADMIN_HOST);
    vi.stubEnv("ADMIN_ROOT_DOMAIN", "admin.pagka.dev");
    vi.stubEnv("ADMIN_PORTAL_ALLOWED_EMAILS", PLATFORM_EMAIL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a tenant SUPERADMIN whose email is not allow-listed on a platform-admin API", async () => {
    const response = await requestAs("/api/platform-admin/companies", "owner@signed-up.example");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Superuser access required" });
  });

  it("sends a tenant SUPERADMIN whose email is not allow-listed away from the admin pages", async () => {
    const response = await requestAs("/admin/dashboard", "owner@signed-up.example");
    expect(response.headers.get("location")).toContain("/access-blocked");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("lets the allow-listed superuser through to a platform-admin API", async () => {
    const response = await requestAs("/api/platform-admin/companies", PLATFORM_EMAIL);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rewrites the allow-listed superuser's admin page to the portal", async () => {
    const response = await requestAs("/admin/dashboard", PLATFORM_EMAIL);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/portal/admin/dashboard");
  });
});
