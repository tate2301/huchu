import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "next-auth/jwt";
import { NextRequest, type NextFetchEvent } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";
import proxy from "@/proxy";
import { OPERATOR_COOKIE } from "@/lib/operators/cookie";

const ADMIN_HOST = "portal.admin.pagka.dev";
const SECRET = "proxy-test-secret";

// A workspace owner's NextAuth session. Every tenant's owner is SUPERADMIN,
// which is exactly why the role must open nothing on the admin host.
async function ownerSessionCookie() {
  const sessionToken = await encode({
    secret: SECRET,
    token: {
      sub: "user-1",
      id: "user-1",
      email: "owner@signed-up.example",
      role: "SUPERADMIN",
      companyId: "company-1",
      tenantStatus: "ACTIVE",
      authExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  return `next-auth.session-token=${sessionToken}`;
}

// Runs the real proxy, withAuth and all.
async function request(pathname: string, cookie = "") {
  const req = new NextRequest(`http://${ADMIN_HOST}${pathname}`, {
    headers: { host: ADMIN_HOST, cookie },
  });
  const response = await proxy(req as NextRequestWithAuth, {} as NextFetchEvent);
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends a workspace owner's session to the operator sign-in, not into the portal", async () => {
    const response = await request("/admin/workspaces", await ownerSessionCookie());
    expect(response.headers.get("location")).toContain("/admin/login");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("answers a platform-admin API without an operator session with 401", async () => {
    const response = await request("/api/platform-admin/anything", await ownerSessionCookie());
    expect(response.status).toBe(401);
  });

  it("lets the sign-in steps through without a session", async () => {
    for (const path of ["/admin/login", "/admin/login/code", "/admin/login/set-up"]) {
      const response = await request(path);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("rewrites an operator's admin page to the portal", async () => {
    const response = await request("/admin/workspaces", `${OPERATOR_COOKIE}=some-token`);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/portal/admin/workspaces");
  });

  it("lets an operator's request through to a platform-admin API", async () => {
    const response = await request("/api/platform-admin/anything", `${OPERATOR_COOKIE}=some-token`);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
