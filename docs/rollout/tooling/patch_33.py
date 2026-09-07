import pathlib
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:60]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)

edit("packages/platform/portal-hosts.ts", '''function normalizePrefix(prefix: string | null | undefined): string {
  return prefix?.trim().toLowerCase() ?? "";
}
''', '''function normalizePrefix(prefix: string | null | undefined): string {
  return prefix?.trim().toLowerCase() ?? "";
}

/**
 * How a portal host is spelled under the root.
 *
 * `nested` — `students.acme.<root>` — is today's pattern and the enterprise
 * host's: the portal is a label above the tenant's, and each portal host needs
 * a certificate of its own. `flat` — `students-acme.<root>` — is one label, so
 * a product root's single wildcard certificate covers every portal and
 * standing a tenant up needs no per-host certificate. A host chooses with
 * `PLATFORM_PORTAL_HOSTS=flat`; unset, nothing changes.
 */
export type PortalHostStyle = "nested" | "flat";

export function getPortalHostStyle(): PortalHostStyle {
  return process.env.PLATFORM_PORTAL_HOSTS?.trim().toLowerCase() === "flat" ? "flat" : "nested";
}

/**
 * The portal prefix and tenant slug a flat label carries — `students-acme` is
 * the students' portal of `acme` — or null when the label is a plain tenant's.
 * A slug may itself contain hyphens (`acme-school`), so the split is at the
 * first hyphen, and only when what precedes it is a portal prefix or alias.
 */
export function splitFlatPortalLabel(
  label: string | null | undefined,
): { prefix: string; slug: string; descriptor: PortalHostDescriptor } | null {
  const normalized = normalizePrefix(label);
  const at = normalized.indexOf("-");
  if (at <= 0) return null;
  const prefix = normalized.slice(0, at);
  const slug = normalized.slice(at + 1);
  const descriptor = getPortalHostDescriptorByPrefix(prefix);
  return descriptor && slug ? { prefix, slug, descriptor } : null;
}
''')
edit("packages/platform/portal-hosts.ts", '''export function buildPortalHost(prefix: string, tenantSlug: string, rootDomain: string): string {
  return `${normalizePrefix(prefix)}.${tenantSlug.trim().toLowerCase()}.${rootDomain.trim().toLowerCase()}`;
}''', '''export function buildPortalHost(
  prefix: string,
  tenantSlug: string,
  rootDomain: string,
  style: PortalHostStyle = getPortalHostStyle(),
): string {
  const label = normalizePrefix(prefix);
  const slug = tenantSlug.trim().toLowerCase();
  const root = rootDomain.trim().toLowerCase();
  return style === "flat" ? `${label}-${slug}.${root}` : `${label}.${slug}.${root}`;
}''')
edit("packages/platform/tenant.ts", '''import {
  buildPortalHost,
  getPortalHostDescriptorByPath,
  getPortalHostDescriptorByPrefix,
  getPortalHostPrefixes,
  isPortalAliasPrefix,
} from "./portal-hosts";''', '''import {
  buildPortalHost,
  getPortalHostDescriptorByPath,
  getPortalHostDescriptorByPrefix,
  getPortalHostPrefixes,
  getPortalHostStyle,
  isPortalAliasPrefix,
  splitFlatPortalLabel,
} from "./portal-hosts";''')
edit("packages/platform/tenant.ts", '''    const portalDescriptor = getPortalHostDescriptorByPrefix(slug);
    if (portalDescriptor) {
      return {
        tenantSlug: null,
        portalSubdomain: slug,
        portalCanonicalPrefix: portalDescriptor.canonicalPrefix,
        portalPath: portalDescriptor.portalPath,
        portalLoginPath: portalDescriptor.loginPath,
        portalIsAlias: isPortalAliasPrefix(slug, portalDescriptor),
      };
    }
    return {
      tenantSlug: slug,''', '''    const portalDescriptor = getPortalHostDescriptorByPrefix(slug);
    if (portalDescriptor) {
      return {
        tenantSlug: null,
        portalSubdomain: slug,
        portalCanonicalPrefix: portalDescriptor.canonicalPrefix,
        portalPath: portalDescriptor.portalPath,
        portalLoginPath: portalDescriptor.loginPath,
        portalIsAlias: isPortalAliasPrefix(slug, portalDescriptor),
      };
    }
    // On a host that spells its portals flat, `students-acme` is a portal host
    // of the tenant `acme`; the nested spelling below is still understood, so
    // a preview or a bookmark in the old form keeps resolving.
    if (getPortalHostStyle() === "flat") {
      const flat = splitFlatPortalLabel(slug);
      if (flat && TENANT_SLUG_PATTERN.test(flat.slug)) {
        return {
          tenantSlug: flat.slug,
          portalSubdomain: flat.prefix,
          portalCanonicalPrefix: flat.descriptor.canonicalPrefix,
          portalPath: flat.descriptor.portalPath,
          portalLoginPath: flat.descriptor.loginPath,
          portalIsAlias: isPortalAliasPrefix(flat.prefix, flat.descriptor),
        };
      }
    }
    return {
      tenantSlug: slug,''')
(ROOT / "packages/platform/portal-hosts.test.ts").write_text('''import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
''')
print("wrote packages/platform/portal-hosts.test.ts")

# docs: the runbook's §7 item 5 and env list, the env example, the plan
edit("docs/rollout/product-split-deployment.md", '''5. **Portal hosts.** The kernel forms a portal host as `<prefix>.<slug>.<root>` today
   (`students.`, `parents.`, `staff.` for the school, `pos.` for the till — see
   `packages/platform/portal-hosts.ts`). On a product root that is two labels under the root,
   which the one wildcard certificate does **not** cover: a portal host there needs its own
   certificate, issued through the Vercel API as the enterprise host's portal hosts are today.
   The plan's one-label form (`parents-<slug>.campus.corelith.co.zw`, `pos-<slug>.sell.…`),
   which the wildcard covers and which frees self-serve signup from the Vercel API call, is
   Phase 3.3 — a host-level switch in the kernel, off on the enterprise host — and lands
   before any portal host is served from a product root.''', '''5. **Portal hosts are one label on a product root.** Set `PLATFORM_PORTAL_HOSTS=flat` on every
   product host: the kernel then spells a portal host `<prefix>-<slug>.<root>`
   (`students-acme.campus.corelith.co.zw`, `pos-acme.sell.corelith.co.zw`; `students`,
   `parents` (alias `guardian`), `staff` for the school, `pos` for the till — see
   `packages/platform/portal-hosts.ts`), which the product's one wildcard certificate covers, so
   standing a tenant up needs no per-host certificate and no Vercel API call. The enterprise
   host leaves the variable unset and keeps today's `<prefix>.<slug>.<root>`, each portal host
   with its own certificate as now. A flat host still understands the nested spelling, so a
   preview or a bookmark in the old form keeps resolving; a nested host reads `students-acme`
   as a plain tenant, which is why the switch is per host and never ambiguous.''')
edit("docs/rollout/product-split-deployment.md", '''   - `PLATFORM_ROOT_DOMAIN` from the table and `PLATFORM_ROOT_HOSTS` to match;''',
     '''   - `PLATFORM_ROOT_DOMAIN` from the table and `PLATFORM_ROOT_HOSTS` to match;
   - `PLATFORM_PORTAL_HOSTS=flat` (item 5);''')
edit(".env.example", '''PLATFORM_ROOT_DOMAIN=""
PLATFORM_ROOT_HOSTS="localhost:3000"''', '''PLATFORM_ROOT_DOMAIN=""
PLATFORM_ROOT_HOSTS="localhost:3000"
# How a portal host is spelled under the root. Unset: `students.acme.<root>`,
# today's pattern (the enterprise host). `flat`: `students-acme.<root>`, one
# label, so a product host's single wildcard certificate covers every portal.
# Set it on the product hosts (apps/campus, apps/sell, ...), never on apps/legacy.
# PLATFORM_PORTAL_HOSTS="flat"''')
ROW = ("| 2026-09-06 | — | **Phase 3.3 executed: portal hosts one label on product roots.** The kernel spells a portal host `<prefix>-<slug>.<root>` when "
       "the host sets `PLATFORM_PORTAL_HOSTS=flat` (`buildPortalHost` takes the style; `getPlatformHostContext` reads the flat label back, splitting at the "
       "first hyphen only when the head is a portal prefix or alias, so a hyphenated tenant slug stays a tenant). Unset, nothing changes: the enterprise "
       "host keeps `<prefix>.<slug>.<root>`. A flat host still understands the nested spelling; a nested host reads `students-acme` as a plain tenant, which "
       "is why the switch is per host. Covered by `packages/platform/portal-hosts.test.ts`; the proxy, the allowed-hosts claim, the till's host and the "
       "school's portal links all go through `buildPortalHost`, so they follow the switch without a change of their own. The runbook's §7 item 5 says to set "
       "the variable on every product host. |\\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\\n|---|---|---|\\n", "| Date | Commit | Description |\\n|---|---|---|\\n" + ROW)
print("done")
