/**
 * The gates, as enforced.
 *
 * SS-1.1 and SS-1.2 turned two decorations into rules: the feature policy now
 * denies by default instead of ending in `return true`, and the subscription
 * health the token has always carried now costs a lapsed tenant its writes. Both
 * of those are one-line regressions away from being decorative again — a stray
 * `?? true`, a check dropped from the proxy — and neither failure is visible
 * from the outside until a stranger reaches something they never paid for. So
 * they are pinned here.
 *
 * The proxy is exercised directly with a fabricated token rather than through a
 * browser: `withAuth` is stubbed to hand back the middleware body, which is the
 * part that makes the decisions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";

import { canAccessRouteWithToken } from "@corelithzw/platform/gating/enforcer";
import { isAllowByDefaultFeaturePolicy } from "@corelithzw/platform/gating/policy";
import { resolveFeatureKeyForPath } from "@corelithzw/platform/gating/route-registry";
import {
  SUBSCRIPTION_READ_ONLY_CODE,
  getSubscriptionHealth,
  isBlockingSubscriptionState,
  isReadOnlyHttpMethod,
  isSubscriptionReadOnly,
} from "@corelithzw/platform/subscription";

// The middleware body is what is under test; next-auth's session plumbing is
// not. Stubbing `withAuth` to the identity makes the default export the body.
vi.mock("next-auth/middleware", () => ({
  withAuth: (handler: unknown) => handler,
}));

// getSubscriptionHealth's "no subscription row" branch, without a database: every
// existence probe answers nothing, which is what an empty schema looks like to it.
vi.mock("@corelithzw/db/client", () => ({
  prisma: {
    $queryRawUnsafe: async () => [],
  },
}));

import proxyMiddleware from "@/proxy";

const runProxy = proxyMiddleware as unknown as (
  request: NextRequestWithAuth,
) => Promise<NextResponse | undefined>;

type FakeToken = {
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
  subscriptionHealth?: string;
  enabledFeatures?: string[];
  role?: string;
};

const RETAIL_TENANT: FakeToken = {
  companyId: "company-1",
  companySlug: "acme",
  tenantStatus: "ACTIVE",
  subscriptionHealth: "ACTIVE",
  role: "MANAGER",
  enabledFeatures: ["retail.core", "retail.pos"],
};

function buildRequest(path: string, options: { method?: string; token?: FakeToken | null } = {}) {
  const host = "acme.test";
  const request = new NextRequest(new URL(`https://${host}${path}`), {
    method: options.method ?? "GET",
    headers: { host },
  });

  return Object.assign(request, {
    nextauth: { token: options.token ?? null },
  }) as unknown as NextRequestWithAuth;
}

async function readJson(response: NextResponse | undefined) {
  if (!response) return null;
  return (await response.json()) as Record<string, unknown>;
}

const ENV_KEYS = [
  "FEATURE_GATE_POLICY",
  "NEXT_PUBLIC_FEATURE_GATE_POLICY",
  "FEATURE_GATES_BYPASS",
  "FEATURE_GATES_BYPASS_KEYS",
  "PLATFORM_ROOT_DOMAIN",
  "PLATFORM_ROOT_HOSTS",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("feature gate policy", () => {
  it("denies by default, with no environment variable set", () => {
    // The whole of SS-1.1 in one assertion: an unconfigured deployment gates.
    expect(isAllowByDefaultFeaturePolicy()).toBe(false);
  });

  it("still opens for the break-glass value", () => {
    process.env.FEATURE_GATE_POLICY = "allow";
    expect(isAllowByDefaultFeaturePolicy()).toBe(true);
  });

  it("reads deny explicitly too, so the variable means the same thing both ways", () => {
    process.env.FEATURE_GATE_POLICY = "deny";
    expect(isAllowByDefaultFeaturePolicy()).toBe(false);
  });
});

describe("route feature enforcement under deny-by-default", () => {
  it("lets an unmapped path through — unmapped means ungated, not forbidden", () => {
    // The registry is hand-maintained against a router with hundreds of routes.
    // If "no entry" meant "denied", the first forgotten entry would be a
    // production outage for every tenant at once.
    expect(resolveFeatureKeyForPath("/api/v2/records/search")).toBeNull();

    const decision = canAccessRouteWithToken("/api/v2/records/search", ["schools.core"]);
    expect(decision.allowed).toBe(true);
  });

  it("lets a path nobody has ever registered through as well", () => {
    const decision = canAccessRouteWithToken("/api/not-a-real-surface/anything", []);
    expect(decision.allowed).toBe(true);
  });

  it("passes an entitled tenant", () => {
    const decision = canAccessRouteWithToken("/api/retail/pos", ["retail.core", "retail.pos"]);
    expect(decision.allowed).toBe(true);
    expect(decision.featureKey).toBe("retail.pos");
  });

  it("refuses a tenant that does not hold the feature", () => {
    const decision = canAccessRouteWithToken("/api/retail/pos", ["schools.core"]);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("FEATURE_DISABLED");
  });

  it("refuses a tenant carrying no entitlements at all", () => {
    // This is the case that used to fail open: an empty list was read as "we do
    // not know" and allowed, which is every tenant on a token minted before its
    // features were resolved.
    const decision = canAccessRouteWithToken("/api/retail/pos", []);
    expect(decision.allowed).toBe(false);
  });

  it("covers the gold module's API surface, which had no entry before SS-1.1", () => {
    expect(resolveFeatureKeyForPath("/api/gold/imports")).toBe("gold.home");
    expect(canAccessRouteWithToken("/api/gold/summary", ["schools.core"]).allowed).toBe(false);
    expect(canAccessRouteWithToken("/api/gold/summary", ["gold.home"]).allowed).toBe(true);
  });
});

describe("proxy enforcement", () => {
  it("lets an entitled tenant write", async () => {
    const response = await runProxy(
      buildRequest("/api/retail/pos", { method: "POST", token: RETAIL_TENANT }),
    );
    expect(response?.status).toBe(200);
  });

  it("refuses a tenant that does not hold the feature", async () => {
    const response = await runProxy(
      buildRequest("/api/retail/pos", {
        method: "GET",
        token: { ...RETAIL_TENANT, enabledFeatures: ["schools.core"] },
      }),
    );
    expect(response?.status).toBe(403);
    expect((await readJson(response))?.code).toBe("FEATURE_DISABLED");
  });

  it("lets an EXPIRED_BLOCKED tenant read its own data", async () => {
    const response = await runProxy(
      buildRequest("/api/retail/pos", {
        method: "GET",
        token: {
          ...RETAIL_TENANT,
          tenantStatus: "SUBSCRIPTION_INACTIVE",
          subscriptionHealth: "EXPIRED_BLOCKED",
        },
      }),
    );
    // Degradation, not a wall: the merchant can still see yesterday's takings.
    expect(response?.status).toBe(200);
  });

  it("refuses an EXPIRED_BLOCKED tenant's writes, by name", async () => {
    const response = await runProxy(
      buildRequest("/api/retail/pos", {
        method: "POST",
        token: {
          ...RETAIL_TENANT,
          tenantStatus: "SUBSCRIPTION_INACTIVE",
          subscriptionHealth: "EXPIRED_BLOCKED",
        },
      }),
    );
    expect(response?.status).toBe(403);
    const body = await readJson(response);
    expect(body?.code).toBe(SUBSCRIPTION_READ_ONLY_CODE);
    expect(body?.state).toBe("EXPIRED_BLOCKED");
  });

  it("degrades a page-level write too, since a server action posts to the page", async () => {
    const response = await runProxy(
      buildRequest("/retail/pos", {
        method: "POST",
        token: {
          ...RETAIL_TENANT,
          tenantStatus: "SUBSCRIPTION_INACTIVE",
          subscriptionHealth: "EXPIRED_BLOCKED",
        },
      }),
    );
    expect(response?.status).toBe(403);
    expect((await readJson(response))?.code).toBe(SUBSCRIPTION_READ_ONLY_CODE);
  });

  it("still closes the door on a tenant an operator switched off", async () => {
    // Non-payment is degraded; a suspended tenant is not.
    const response = await runProxy(
      buildRequest("/api/retail/pos", {
        method: "GET",
        token: { ...RETAIL_TENANT, tenantStatus: "SUSPENDED", subscriptionHealth: "ACTIVE" },
      }),
    );
    expect(response?.status).toBe(403);
    expect((await readJson(response))?.error).toBe("Tenant is inactive");
  });
});

describe("subscription degradation helpers", () => {
  it("treats only the safe verbs as reads", () => {
    expect(isReadOnlyHttpMethod("GET")).toBe(true);
    expect(isReadOnlyHttpMethod("head")).toBe(true);
    expect(isReadOnlyHttpMethod("POST")).toBe(false);
    expect(isReadOnlyHttpMethod("DELETE")).toBe(false);
    expect(isReadOnlyHttpMethod("PATCH")).toBe(false);
  });

  it("degrades on either claim, so a stale half of the token cannot re-open writes", () => {
    expect(isSubscriptionReadOnly({ subscriptionHealth: "EXPIRED_BLOCKED" })).toBe(true);
    expect(isSubscriptionReadOnly({ tenantStatus: "SUBSCRIPTION_INACTIVE" })).toBe(true);
    expect(isSubscriptionReadOnly({ subscriptionHealth: "ACTIVE", tenantStatus: "ACTIVE" })).toBe(false);
    expect(isSubscriptionReadOnly({ subscriptionHealth: "IN_GRACE", tenantStatus: "ACTIVE" })).toBe(false);
  });

  it("agrees with getSubscriptionHealth about what blocks", async () => {
    // The proxy can only see the state name on the token, so the state-name set
    // it reads has to say the same thing shouldBlock says. This is the drift
    // detector for that pair.
    const health = await getSubscriptionHealth("company-without-a-subscription");
    expect(health.state).toBe("MISSING_SUBSCRIPTION");
    expect(isBlockingSubscriptionState(health.state)).toBe(health.shouldBlock);
  });
});
