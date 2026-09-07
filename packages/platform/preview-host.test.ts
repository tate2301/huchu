import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PREVIEW_HOST_COOKIE,
  isHostEnforcementBypassed,
  isPreviewHostOverrideEnabled,
  normalizePreviewHost,
  previewHostForTenantSlug,
  readPreviewHostIntentFromUrl,
  resolvePreviewHostOverride,
  stripPreviewHostParams,
} from "./preview-host";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext, isAllowedHost } from "./tenant";

const ENV_KEYS = [
  "PREVIEW_HOST_OVERRIDE",
  "PREVIEW_BYPASS_HOST_ENFORCEMENT",
  "PREVIEW_HOST_ALLOWLIST",
  "PLATFORM_ROOT_DOMAIN",
  "VERCEL_ENV",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

function cookie(host: string): string {
  return `${PREVIEW_HOST_COOKIE}=${encodeURIComponent(host)}`;
}

describe("the switch", () => {
  it("is off by default", () => {
    expect(isPreviewHostOverrideEnabled()).toBe(false);
    expect(isHostEnforcementBypassed()).toBe(false);
  });

  it("accepts the usual spellings of yes", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      process.env.PREVIEW_HOST_OVERRIDE = value;
      expect(isPreviewHostOverrideEnabled()).toBe(true);
    }
  });

  it("stays off for anything else", () => {
    for (const value of ["0", "false", "no", "", "  "]) {
      process.env.PREVIEW_HOST_OVERRIDE = value;
      expect(isPreviewHostOverrideEnabled()).toBe(false);
    }
  });

  // Nominating your own Host header is the exact thing tenant enforcement
  // exists to prevent, so a leaked flag must not switch it on in production.
  it("refuses to switch on in production however hard the flag is set", () => {
    process.env.VERCEL_ENV = "production";
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    process.env.PREVIEW_BYPASS_HOST_ENFORCEMENT = "1";
    expect(isPreviewHostOverrideEnabled()).toBe(false);
    expect(isHostEnforcementBypassed()).toBe(false);
  });

  it("works on preview and on a build with no VERCEL_ENV at all", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    process.env.VERCEL_ENV = "preview";
    expect(isPreviewHostOverrideEnabled()).toBe(true);
    delete process.env.VERCEL_ENV;
    expect(isPreviewHostOverrideEnabled()).toBe(true);
  });
});

describe("validating a nominated host", () => {
  it("takes a hostname, with or without a scheme, path or port", () => {
    expect(normalizePreviewHost("floorcode.pagka.dev")).toBe("floorcode.pagka.dev");
    expect(normalizePreviewHost("HTTPS://Floorcode.Pagka.Dev/crm")).toBe("floorcode.pagka.dev");
    expect(normalizePreviewHost("floorcode.pagka.dev.")).toBe("floorcode.pagka.dev");
    expect(normalizePreviewHost("localhost:3000")).toBe("localhost:3000");
  });

  it("refuses anything that is not a host", () => {
    for (const value of ["", "   ", "-bad.example.com", "has space.com", "a".repeat(300), null, undefined]) {
      expect(normalizePreviewHost(value)).toBeNull();
    }
  });

  it("honours an allowlist of suffixes when one is set", () => {
    process.env.PREVIEW_HOST_ALLOWLIST = "pagka.dev, example.test";
    expect(normalizePreviewHost("floorcode.pagka.dev")).toBe("floorcode.pagka.dev");
    expect(normalizePreviewHost("pagka.dev")).toBe("pagka.dev");
    expect(normalizePreviewHost("floorcode.example.test")).toBe("floorcode.example.test");
    expect(normalizePreviewHost("floorcode.evil.com")).toBeNull();
    // Suffix match must be on a label boundary, not a substring.
    expect(normalizePreviewHost("notpagka.dev")).toBeNull();
  });

  it("expands a slug against the root domain", () => {
    process.env.PLATFORM_ROOT_DOMAIN = "pagka.dev";
    expect(previewHostForTenantSlug("floorcode")).toBe("floorcode.pagka.dev");
    expect(previewHostForTenantSlug("FloorCode")).toBe("floorcode.pagka.dev");
    expect(previewHostForTenantSlug("not a slug")).toBeNull();
  });

  it("cannot expand a slug with no root domain configured", () => {
    expect(previewHostForTenantSlug("floorcode")).toBeNull();
  });
});

describe("resolving the override from a request", () => {
  it("returns nothing while the switch is off, cookie or no cookie", () => {
    expect(resolvePreviewHostOverride(null, cookie("floorcode.pagka.dev"))).toBeNull();
  });

  it("reads the cookie once switched on", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    expect(resolvePreviewHostOverride(null, cookie("floorcode.pagka.dev"))).toBe(
      "floorcode.pagka.dev",
    );
  });

  it("picks the cookie out of a crowd", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    const header = `theme=dark; ${cookie("floorcode.pagka.dev")}; other=1`;
    expect(resolvePreviewHostOverride(null, header)).toBe("floorcode.pagka.dev");
  });

  it("is not fooled by a cookie whose name merely ends the same way", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    expect(resolvePreviewHostOverride(null, `not_${PREVIEW_HOST_COOKIE}=evil.com`)).toBeNull();
  });

  // curl and the e2e suite should not have to clear whatever a browser left.
  it("lets the header beat the cookie", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    expect(resolvePreviewHostOverride("pos.floorcode.pagka.dev", cookie("floorcode.pagka.dev"))).toBe(
      "pos.floorcode.pagka.dev",
    );
  });

  it("falls back to the cookie when the header is junk", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    expect(resolvePreviewHostOverride("not a host", cookie("floorcode.pagka.dev"))).toBe(
      "floorcode.pagka.dev",
    );
  });

  it("falls back to the real host when the cookie is junk", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    expect(resolvePreviewHostOverride(null, `${PREVIEW_HOST_COOKIE}=%%%`)).toBeNull();
  });
});

describe("reading a nomination out of a URL", () => {
  beforeEach(() => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    process.env.PLATFORM_ROOT_DOMAIN = "pagka.dev";
  });

  it("sees nothing when there is nothing to see", () => {
    expect(readPreviewHostIntentFromUrl(new URL("https://x.vercel.app/crm"))).toEqual({
      kind: "absent",
    });
  });

  it("takes a slug", () => {
    expect(readPreviewHostIntentFromUrl(new URL("https://x.vercel.app/login?__tenant=floorcode"))).toEqual(
      { kind: "set", host: "floorcode.pagka.dev" },
    );
  });

  it("takes a whole host, portal prefix and all", () => {
    expect(
      readPreviewHostIntentFromUrl(new URL("https://x.vercel.app/?__host=pos.floorcode.pagka.dev")),
    ).toEqual({ kind: "set", host: "pos.floorcode.pagka.dev" });
  });

  it("treats an empty value as go back to the real host", () => {
    expect(readPreviewHostIntentFromUrl(new URL("https://x.vercel.app/?__host="))).toEqual({
      kind: "clear",
    });
    expect(readPreviewHostIntentFromUrl(new URL("https://x.vercel.app/?__tenant="))).toEqual({
      kind: "clear",
    });
  });

  it("reports a value it cannot use rather than ignoring it", () => {
    expect(readPreviewHostIntentFromUrl(new URL("https://x.vercel.app/?__host=not a host"))).toEqual({
      kind: "invalid",
      value: "not a host",
    });
  });

  it("ignores the parameter entirely while the switch is off", () => {
    delete process.env.PREVIEW_HOST_OVERRIDE;
    expect(readPreviewHostIntentFromUrl(new URL("https://x.vercel.app/?__tenant=floorcode"))).toEqual({
      kind: "absent",
    });
  });

  it("strips both parameters and leaves the rest alone", () => {
    const url = new URL("https://x.vercel.app/crm?__tenant=floorcode&__host=a.b&view=board");
    stripPreviewHostParams(url);
    expect(url.search).toBe("?view=board");
  });
});

describe("what the rest of the app then sees", () => {
  const headers = (host: string, cookieHeader?: string) =>
    new Headers({ host, ...(cookieHeader ? { cookie: cookieHeader } : {}) });

  it("reports the real host when nothing is nominated", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    expect(getHostHeaderFromRequestHeaders(headers("x.vercel.app"))).toBe("x.vercel.app");
  });

  // The point of the whole exercise: a preview URL resolves a tenant.
  it("resolves a tenant slug on a hostname that has none of its own", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    process.env.PLATFORM_ROOT_DOMAIN = "pagka.dev";

    const bare = getPlatformHostContext(getHostHeaderFromRequestHeaders(headers("x.vercel.app")));
    expect(bare.tenantSlug).toBeNull();
    expect(bare.strictTenantEnforcement).toBe(true);

    const overridden = getPlatformHostContext(
      getHostHeaderFromRequestHeaders(headers("x.vercel.app", cookie("floorcode.pagka.dev"))),
    );
    expect(overridden.tenantSlug).toBe("floorcode");
    expect(overridden.isTenantHost).toBe(true);
  });

  it("resolves a portal host the same way", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    process.env.PLATFORM_ROOT_DOMAIN = "pagka.dev";

    const context = getPlatformHostContext(
      getHostHeaderFromRequestHeaders(headers("x.vercel.app", cookie("pos.floorcode.pagka.dev"))),
    );
    expect(context.tenantSlug).toBe("floorcode");
    expect(context.portalPath).toBe("/portal/pos");
  });

  it("passes the allowed-host check that would otherwise refuse the preview", () => {
    process.env.PREVIEW_HOST_OVERRIDE = "1";
    process.env.PLATFORM_ROOT_DOMAIN = "pagka.dev";
    const allowed = ["floorcode.pagka.dev"];

    expect(isAllowedHost("x.vercel.app", allowed)).toBe(false);
    expect(
      isAllowedHost(
        getHostHeaderFromRequestHeaders(headers("x.vercel.app", cookie("floorcode.pagka.dev"))),
        allowed,
      ),
    ).toBe(true);
  });

  it("lets the escape hatch admit a host nobody claims", () => {
    expect(isAllowedHost("x.vercel.app", ["floorcode.pagka.dev"])).toBe(false);
    process.env.PREVIEW_BYPASS_HOST_ENFORCEMENT = "1";
    expect(isAllowedHost("x.vercel.app", ["floorcode.pagka.dev"])).toBe(true);
    // Even with no allowed hosts at all, which is the state that bricks a
    // deployment onto /access-blocked with no way back.
    expect(isAllowedHost("x.vercel.app", undefined)).toBe(true);
  });

  it("keeps the escape hatch shut in production", () => {
    process.env.VERCEL_ENV = "production";
    process.env.PREVIEW_BYPASS_HOST_ENFORCEMENT = "1";
    expect(isAllowedHost("x.vercel.app", ["floorcode.pagka.dev"])).toBe(false);
  });
});
