import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildPortalHost, getPortalHostStyle, splitFlatPortalLabel } from "./portal-hosts";
import { getPlatformHostContext } from "./tenant";

const ROOT = "campus.corelith.co.zw";
const saved: Record<string, string | undefined> = {};
const ENV_KEYS = ["PLATFORM_PORTAL_HOSTS", "PLATFORM_ROOT_DOMAIN", "PLATFORM_ROOT_HOSTS"] as const;

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.PLATFORM_ROOT_DOMAIN = ROOT;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("portal host style", () => {
  it("is nested unless a host opts into flat", () => {
    expect(getPortalHostStyle()).toBe("nested");
    process.env.PLATFORM_PORTAL_HOSTS = "flat";
    expect(getPortalHostStyle()).toBe("flat");
    process.env.PLATFORM_PORTAL_HOSTS = "anything-else";
    expect(getPortalHostStyle()).toBe("nested");
  });

  it("builds today's nested host by default and the flat one on request", () => {
    expect(buildPortalHost("students", "acme", ROOT)).toBe(`students.acme.${ROOT}`);
    process.env.PLATFORM_PORTAL_HOSTS = "flat";
    expect(buildPortalHost("students", "acme", ROOT)).toBe(`students-acme.${ROOT}`);
    expect(buildPortalHost("Pos", " Acme-Mart ", ROOT, "nested")).toBe(`pos.acme-mart.${ROOT}`);
    expect(buildPortalHost("pos", "acme-mart", ROOT, "flat")).toBe(`pos-acme-mart.${ROOT}`);
  });
});

describe("splitFlatPortalLabel", () => {
  it("splits at the first hyphen when the head is a portal prefix or alias", () => {
    expect(splitFlatPortalLabel("students-acme-school")).toMatchObject({ prefix: "students", slug: "acme-school" });
    expect(splitFlatPortalLabel("guardian-acme")).toMatchObject({ prefix: "guardian", slug: "acme" });
    expect(splitFlatPortalLabel("pos-acme")?.descriptor.portalPath).toBe("/portal/pos");
  });

  it("leaves a plain tenant label alone, hyphens and all", () => {
    expect(splitFlatPortalLabel("acme-school")).toBeNull();
    expect(splitFlatPortalLabel("acme")).toBeNull();
    expect(splitFlatPortalLabel("students-")).toBeNull();
    expect(splitFlatPortalLabel("-acme")).toBeNull();
    expect(splitFlatPortalLabel(null)).toBeNull();
  });
});

describe("host context with flat portal hosts", () => {
  it("reads a flat label as the tenant's portal on a flat host", () => {
    process.env.PLATFORM_PORTAL_HOSTS = "flat";
    const context = getPlatformHostContext(`students-acme.${ROOT}`);
    expect(context.tenantSlug).toBe("acme");
    expect(context.portalCanonicalPrefix).toBe("students");
    expect(context.portalPath).toBe("/portal/student");
    expect(context.portalLoginPath).toBe("/portal/student/login");
    expect(context.portalIsAlias).toBe(false);
    expect(context.isTenantHost).toBe(true);
  });

  it("marks an alias prefix as one, flat or nested", () => {
    process.env.PLATFORM_PORTAL_HOSTS = "flat";
    const flat = getPlatformHostContext(`guardian-acme.${ROOT}`);
    expect(flat.tenantSlug).toBe("acme");
    expect(flat.portalCanonicalPrefix).toBe("parents");
    expect(flat.portalIsAlias).toBe(true);
    const nested = getPlatformHostContext(`guardian.acme.${ROOT}`);
    expect(nested.tenantSlug).toBe("acme");
    expect(nested.portalIsAlias).toBe(true);
  });

  it("keeps a hyphenated tenant slug a tenant, on either style", () => {
    process.env.PLATFORM_PORTAL_HOSTS = "flat";
    const flat = getPlatformHostContext(`acme-school.${ROOT}`);
    expect(flat.tenantSlug).toBe("acme-school");
    expect(flat.portalPath).toBeNull();
    delete process.env.PLATFORM_PORTAL_HOSTS;
    const nested = getPlatformHostContext(`acme-school.${ROOT}`);
    expect(nested.tenantSlug).toBe("acme-school");
    expect(nested.portalPath).toBeNull();
  });

  it("reads the same flat label as a plain tenant on a nested host, which is why the switch is per host", () => {
    const context = getPlatformHostContext(`students-acme.${ROOT}`);
    expect(context.tenantSlug).toBe("students-acme");
    expect(context.portalPath).toBeNull();
  });

  it("still understands the nested spelling on a flat host", () => {
    process.env.PLATFORM_PORTAL_HOSTS = "flat";
    const context = getPlatformHostContext(`pos.acme.${ROOT}`);
    expect(context.tenantSlug).toBe("acme");
    expect(context.portalPath).toBe("/portal/pos");
  });

  it("leaves the root and a bare portal label as they were", () => {
    process.env.PLATFORM_PORTAL_HOSTS = "flat";
    expect(getPlatformHostContext(ROOT).isCentralHost).toBe(true);
    const bare = getPlatformHostContext(`students.${ROOT}`);
    expect(bare.tenantSlug).toBeNull();
    expect(bare.portalPath).toBe("/portal/student");
  });
});
