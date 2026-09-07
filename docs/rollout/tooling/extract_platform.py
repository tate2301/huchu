"""Phase 2.2: extract packages/platform from apps/legacy. Mechanical, asserted, in steps."""
import os, re, json, subprocess, collections, sys
ROOT = "/home/user/huchu"; APP = f"{ROOT}/apps/legacy"; PKG = f"{ROOT}/packages/platform"; HOST = f"{APP}/lib/host"
def sh(cmd): subprocess.run(cmd, shell=True, check=True, cwd=ROOT)
steps = sys.argv[1:] or ["all"]
def want(name): return "all" in steps or name in steps

def walk(base):
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in ("node_modules", ".next", ".turbo")]
        for f in fn:
            if f.endswith((".ts", ".tsx", ".js", ".mjs", ".jsx")):
                yield os.path.join(dp, f)

def edit(path, pairs):
    s = open(path).read()
    for old, new, count in pairs:
        n = s.count(old)
        assert n == count, (path, old[:80], n, count)
    for old, new, count in pairs:
        s = s.replace(old, new)
    open(path, "w").write(s)

# ---- move ----------------------------------------------------------------------------------
# What stays in the host, under lib/host: provisioning (it seeds the accounting module) and the
# tests that read the host's composition (its proxy, its scripts, its navigation model, its
# registered modules).
LEFT = [("lib/platform/provision.ts", "provision.ts"), ("lib/platform/provision.test.ts", "provision.test.ts"),
        ("lib/platform/gating/enforcement.test.ts", "enforcement.test.ts"),
        ("lib/platform/role-consistency.test.ts", "role-consistency.test.ts"),
        ("lib/platform/permission-catalog.test.ts", "permission-catalog.test.ts"),
        ("lib/workspace-feature-resolution.test.ts", "workspace-feature-resolution.test.ts")]
SINGLE = ["roles", "public-routes", "api-utils", "api-response", "api-client", "logging", "id-generator",
          "id-generator-school-numbering.test", "money", "money.test", "serialize-decimals", "user-management-api",
          "site-url", "workspace-products"]
if want("move"):
    os.makedirs(PKG, exist_ok=True); os.makedirs(HOST, exist_ok=True)
    for old, new in LEFT:
        sh(f'git mv "{APP}/{old}" "{HOST}/{new}"')
    def move_dir(old_dir, new_dir):
        os.makedirs(f"{PKG}/{new_dir}" if new_dir else PKG, exist_ok=True)
        for entry in sorted(os.listdir(f"{APP}/{old_dir}")):
            rel = f"{old_dir}/{entry}"
            dst = f"{PKG}/{new_dir}/{entry}" if new_dir else f"{PKG}/{entry}"
            sh(f'git mv "{APP}/{rel}" "{dst}"')
    move_dir("lib/platform", "")
    move_dir("lib/auth-core", "auth-core")
    sh(f'git mv "{APP}/lib/admin-portal.ts" "{PKG}/admin-portal.ts"')
    move_dir("lib/admin-portal", "admin-portal")
    move_dir("lib/preferences", "preferences")
    for f in SINGLE:
        sh(f'git mv "{APP}/lib/{f}.ts" "{PKG}/{f}.ts"')
    os.makedirs(f"{PKG}/audit", exist_ok=True); sh(f'git mv "{APP}/lib/audit/platform.ts" "{PKG}/audit/platform.ts"')
    for d in ["observability", "uploads"]:
        sh(f'git mv "{APP}/lib/{d}" "{PKG}/{d}"')
    for d in ["lib/platform/gating", "lib/platform", "lib/auth-core", "lib/admin-portal", "lib/preferences"]:
        p = f"{APP}/{d}"
        if os.path.isdir(p) and not os.listdir(p): os.rmdir(p)
    print("moved")

# ---- rewrite -------------------------------------------------------------------------------
SPECIAL = {"lib/platform/provision": "@/lib/host/provision"}
PREFIX_MAP = [("lib/platform", ""), ("lib/auth-core", "auth-core"), ("lib/admin-portal", "admin-portal"), ("lib/roles", "roles"),
              ("lib/public-routes", "public-routes"), ("lib/api-utils", "api-utils"), ("lib/api-response", "api-response"),
              ("lib/api-client", "api-client"), ("lib/audit/platform", "audit/platform"), ("lib/logging", "logging"),
              ("lib/observability", "observability"), ("lib/id-generator", "id-generator"), ("lib/money", "money"),
              ("lib/serialize-decimals", "serialize-decimals"), ("lib/uploads", "uploads"), ("lib/preferences", "preferences"),
              ("lib/user-management-api", "user-management-api"), ("lib/site-url", "site-url"),
              ("lib/workspace-products", "workspace-products")]
alts = "|".join(re.escape(p) for p, _ in sorted(PREFIX_MAP, key=lambda x: -len(x[0])))
SPEC = re.compile(r'(["\'])@/(' + alts + r')(/[^"\']*)?\1')
SPECIAL_RE = re.compile(r'(["\'])@/(' + "|".join(re.escape(k) for k in SPECIAL) + r')\1')

def rewrite_file(path, in_package):
    txt = open(path, encoding="utf-8").read()
    new = SPECIAL_RE.sub(lambda m: f"{m.group(1)}{SPECIAL[m.group(2)]}{m.group(1)}", txt)
    def repl(m):
        q, prefix, rest = m.group(1), m.group(2), m.group(3) or ""
        target = (dict(PREFIX_MAP)[prefix] + rest).lstrip("/")
        if in_package:
            rel = os.path.relpath(f"{PKG}/{target}" if target else f"{PKG}/index", os.path.dirname(path))
            if not rel.startswith("."): rel = "./" + rel
            return f"{q}{rel}{q}"
        return f'{q}@corelithzw/platform{"/" + target if target else ""}{q}'
    new = SPEC.sub(repl, new)
    if new != txt:
        open(path, "w", encoding="utf-8").write(new); return 1
    return 0

if want("rewrite"):
    a = sum(rewrite_file(p, False) for p in walk(APP)); b = sum(rewrite_file(p, True) for p in walk(PKG))
    # the one relative import into a moved file from a file that stays
    edit(f"{APP}/lib/audit/gold.ts", [('from "./platform"', 'from "@corelithzw/platform/audit/platform"', 1)])
    print(f"rewritten: app={a} package={b}")

# ---- seams ---------------------------------------------------------------------------------
if want("seams"):
    # (1) registries live on globalThis, like the Prisma client
    open(f"{PKG}/registry.ts", "w").write('''/**
 * Registries the kernel keeps and never fills.
 *
 * A host composes itself at boot (`modules.ts`, imported from
 * `instrumentation.ts`) by registering into these: NextAuth's options, the
 * capability sets of the modules it composes, and the module manifests as they
 * arrive. The storage hangs off `globalThis` under a symbol, for the reason the
 * Prisma client's does: a hot reload in development re-evaluates the module
 * that declares a registry, and a bundle that carries a second copy of that
 * module must still see the one set of registrations.
 */
const KEY = Symbol.for("@corelithzw/platform/registries");

type Registries = Map<string, unknown>;

function registries(): Registries {
  const holder = globalThis as unknown as Record<symbol, Registries | undefined>;
  return (holder[KEY] ??= new Map());
}

export function registry<T>(name: string, create: () => T): T {
  const all = registries();
  if (!all.has(name)) all.set(name, create());
  return all.get(name) as T;
}
''')

    # (2) how the host authenticates: NextAuth's options through a registry
    open(f"{PKG}/auth-core/auth-options.ts", "w").write('''import type { NextAuthOptions } from "next-auth";
import { registry } from "../registry";

/**
 * How the host authenticates.
 *
 * NextAuth's options name the host's providers, adapter and secret, and one of
 * its callbacks asks the retail module a question, so the kernel does not own
 * them. It asks the host for them through this registry instead. The provider
 * is read on every call and may be lazy: the app's test setup registers one
 * that imports the options on first use, so a test's own mocks still apply.
 */
export type AuthOptionsProvider = () => NextAuthOptions | Promise<NextAuthOptions>;

const slot = registry<{ provider: AuthOptionsProvider | null }>("auth-options", () => ({ provider: null }));

export function registerAuthOptions(provider: AuthOptionsProvider): void {
  slot.provider = provider;
}

export async function resolveAuthOptions(): Promise<NextAuthOptions> {
  if (!slot.provider) {
    throw new Error(
      "No auth options registered. The host registers them at boot: registerAuthOptions(() => authOptions) in modules.ts, imported from instrumentation.ts.",
    );
  }
  return slot.provider();
}
''')
    open(f"{PKG}/auth-core/session.ts", "w").write('''import { getServerSession } from "next-auth";
import { resolveAuthOptions } from "./auth-options";
import type { AuthenticatedSession } from "./types";

/** The signed-in session of the current request, or null. */
export async function getCurrentAuthSession(): Promise<AuthenticatedSession | null> {
  return (await getServerSession(await resolveAuthOptions())) as AuthenticatedSession | null;
}
''')
    edit(f"{PKG}/auth-core/guards.ts", [
        ('import { getServerSession } from "next-auth";\n', "", 1),
        ('import { authOptions } from "@/lib/auth";\n', "", 1),
        ('''export async function getCurrentAuthSession(): Promise<AuthenticatedSession | null> {
  return (await getServerSession(authOptions)) as AuthenticatedSession | null;
}
''', '''import { getCurrentAuthSession } from "./session";

export { getCurrentAuthSession };
''', 1),
    ])
    edit(f"{PKG}/admin-portal/auth.ts", [
        ('import { authOptions } from "@/lib/auth";\n', 'import type { NextAuthOptions } from "next-auth";\nimport { resolveAuthOptions } from "../auth-core/auth-options";\n', 1),
        ("function getAdminEmailProvider(): EmailProviderLike {", "function getAdminEmailProvider(authOptions: NextAuthOptions): EmailProviderLike {", 1),
        ("function getVerificationAdapter(): VerificationAdapter {", "function getVerificationAdapter(authOptions: NextAuthOptions): VerificationAdapter {", 1),
        ("function hashVerificationToken(token: string, provider: EmailProviderLike) {", "function hashVerificationToken(token: string, provider: EmailProviderLike, authOptions: NextAuthOptions) {", 1),
        ("  const runtimeConfig = getAuthRuntimeConfig();\n  const provider = getAdminEmailProvider();\n  const adapter = getVerificationAdapter();\n",
         "  const authOptions = await resolveAuthOptions();\n  const runtimeConfig = getAuthRuntimeConfig();\n  const provider = getAdminEmailProvider(authOptions);\n  const adapter = getVerificationAdapter(authOptions);\n", 1),
        ("      token: hashVerificationToken(token, provider),", "      token: hashVerificationToken(token, provider, authOptions),", 1),
    ])
    edit(f"{PKG}/preferences/server.ts", [
        ('import { getServerSession } from "next-auth";\n', "", 1),
        ('import { authOptions } from "@/lib/auth";\n', 'import { getCurrentAuthSession } from "../auth-core/session";\n', 1),
        ("  const session = await getServerSession(authOptions);", "  const session = await getCurrentAuthSession();", 1),
    ])

    # (3) the nav filter reads the shape it needs, not the host's navigation model
    p = f"{PKG}/gating/nav-filter.ts"; s = open(p).read()
    edit(p, [
        ('import type { NavSection } from "@/lib/navigation";\n', "", 1),
        ('export type HrefItem = { href: string };\n', '''export type HrefItem = { href: string };

/**
 * What the filter reads of a navigation section. The kernel does not own the
 * hosts' navigation model, so this is only what gating needs: the section's
 * feature key, its items' hrefs, and the group each item sits in, so that a
 * group with nothing left under it goes too.
 */
export type GatedNavSection = {
  featureKey?: string;
  items: (HrefItem & { group?: string })[];
  groups?: { id: string }[];
};
''', 1),
        ('''export function filterNavSectionsByEnabledFeatures(
  sections: NavSection[],
  enabledFeatures: string[] | undefined,
): NavSection[] {''', '''export function filterNavSectionsByEnabledFeatures<T extends GatedNavSection>(
  sections: T[],
  enabledFeatures: string[] | undefined,
): T[] {''', 1),
    ])

    # (4) the capability registry: the kernel stops naming the CRM
    p = f"{PKG}/permission-catalog.ts"; s = open(p).read()
    old_import = '''import {
  CRM_CAPABILITIES,
  CRM_CAPABILITY_LABELS,
  CRM_CAPABILITY_NOTES,
  capabilitiesForRole,
  type CrmCapability,
} from "@/lib/crm/permissions";
'''
    assert s.count(old_import) == 1; s = s.replace(old_import, 'import { registry } from "./registry";\n')
    start = s.index("/**\n * Capabilities grouped the way somebody thinks"); end = s.index("function domainLabel(domain: string): string {")
    registry_block = '''/**
 * Capabilities are contributed by the modules a host composes: each registers
 * its keys, their labels and notes, the groups they read under, and which
 * roles hold them by default. The kernel keeps the registry and never names a
 * module — the CRM's set lives in the CRM, and a host that does not compose
 * the CRM shows no CRM capabilities at all. Hosts register at boot
 * (`modules.ts`, imported from `instrumentation.ts`).
 */
export type CapabilitySet = {
  module: string;
  capabilities: readonly string[];
  labels: Record<string, string>;
  notes: Record<string, string>;
  /** capability key → group id */
  groups: Record<string, string>;
  groupMeta: Record<string, { label: string; description: string }>;
  groupOrder: readonly string[];
  capabilitiesForRole: (role: string | null | undefined) => ReadonlySet<string>;
};

const capabilitySets = registry<Map<string, CapabilitySet>>("capability-sets", () => new Map());

export function registerCapabilities(set: CapabilitySet): void {
  capabilitySets.set(set.module, set);
}

export function registeredCapabilitySets(): CapabilitySet[] {
  return [...capabilitySets.values()];
}

export function isRegisteredCapability(key: string): boolean {
  return registeredCapabilitySets().some((set) => set.capabilities.includes(key));
}

function capabilityGroupOrder(): string[] {
  return registeredCapabilitySets().flatMap((set) => [...set.groupOrder]);
}

function capabilityGroupFor(key: string): { groupId: string; meta: { label: string; description: string } } {
  for (const set of registeredCapabilitySets()) {
    const groupId = set.groups[key];
    if (groupId) return { groupId, meta: set.groupMeta[groupId] ?? { label: groupId, description: "" } };
  }
  return { groupId: "custom", meta: { label: "Other", description: "" } };
}

'''
    s = s[:start] + registry_block + s[end:]
    open(p, "w").write(s)
    edit(p, [
        ("  const capabilityIndex = CAPABILITY_GROUP_ORDER.indexOf(id);", "  const capabilityIndex = capabilityGroupOrder().indexOf(id);", 1),
        ('''  const roleGrants = capabilitiesForRole(role);

  return CRM_CAPABILITIES.map((capability) => {
    const roleDefault = roleGrants.has(capability);
    const override = overrides.get(capability);
    const state = permissionStateFor(roleDefault, override);

    return {
      id: `capability:${capability}`,
      kind: "CAPABILITY" as const,
      key: capability,
      label: CRM_CAPABILITY_LABELS[capability],
      description: CRM_CAPABILITY_NOTES[capability],
      roleDefault,
      state,
      effective: override ?? roleDefault,
    };
  });
}''', '''  return registeredCapabilitySets().flatMap((set) => {
    const roleGrants = set.capabilitiesForRole(role);

    return set.capabilities.map((capability) => {
      const roleDefault = roleGrants.has(capability);
      const override = overrides.get(capability);
      const state = permissionStateFor(roleDefault, override);

      return {
        id: `capability:${capability}`,
        kind: "CAPABILITY" as const,
        key: capability,
        label: set.labels[capability] ?? capability,
        description: set.notes[capability] ?? "",
        roleDefault,
        state,
        effective: override ?? roleDefault,
      };
    });
  });
}''', 1),
        ('''    const groupId = CAPABILITY_GROUP[entry.key as CrmCapability];
    const meta = CAPABILITY_GROUP_META[groupId];
''', '''    const { groupId, meta } = capabilityGroupFor(entry.key);
''', 1),
        ('''function isCrmCapability(key: string): key is CrmCapability {
  return (CRM_CAPABILITIES as readonly string[]).includes(key);
}

''', "", 1),
        ("  if (!isCrmCapability(input.key)) {", "  if (!isRegisteredCapability(input.key)) {", 1),
    ])

    # the CRM contributes its set
    p = f"{APP}/lib/crm/permissions.ts"; s = open(p).read()
    last_import = list(re.finditer(r"^import [^\n]*\n", s, re.M))[-1].end()
    s = s[:last_import] + 'import type { CapabilitySet } from "@corelithzw/platform/permission-catalog";\n' + s[last_import:]
    s = s.rstrip("\n") + '''

/**
 * What the CRM contributes to the platform's permission catalog. Registered by
 * the host at boot (`modules.ts`); the kernel never imports this file.
 *
 * Capabilities are grouped the way somebody thinks about them, not the way the
 * key happens to be spelled. "Can she delete a record" and "can she merge a
 * duplicate" belong next to each other even though one string starts with
 * `records.delete` and the other with `records.merge`.
 */
export const CRM_CAPABILITY_SET: CapabilitySet = {
  module: "crm",
  capabilities: CRM_CAPABILITIES,
  labels: CRM_CAPABILITY_LABELS,
  notes: CRM_CAPABILITY_NOTES,
  groups: {
    "records.read": "crm-records",
    "records.edit.own": "crm-records",
    "records.edit.any": "crm-records",
    "records.delete": "crm-records",
    "records.merge": "crm-records",
    "records.import": "crm-data",
    "records.export": "crm-data",
    "pipelines.manage": "crm-config",
    "fields.manage": "crm-config",
    "views.share": "crm-config",
    "tasks.assign.others": "crm-work",
    "documents.issue": "crm-documents",
    "documents.approve": "crm-documents",
    "commissions.manage": "crm-money",
    "settings.manage": "crm-config",
  },
  groupMeta: {
    "crm-records": {
      label: "CRM · Records",
      description: "Reading and changing people, companies, deals and sites.",
    },
    "crm-data": {
      label: "CRM · Moving data",
      description: "Bringing records in from a file and taking them back out.",
    },
    "crm-work": {
      label: "CRM · Work",
      description: "Tasks, follow-ups and who they land on.",
    },
    "crm-documents": {
      label: "CRM · Documents",
      description: "Quotes, invoices and sending them to a customer.",
    },
    "crm-money": {
      label: "CRM · Money",
      description: "Commission rules and what they pay out.",
    },
    "crm-config": {
      label: "CRM · Configuration",
      description: "Pipelines, fields, shared views and settings.",
    },
  },
  groupOrder: ["crm-records", "crm-documents", "crm-work", "crm-data", "crm-money", "crm-config"],
  capabilitiesForRole,
};
'''
    open(p, "w").write(s)

    # (5) the host composes itself: at boot, and in the tests that read a registry
    open(f"{APP}/modules.ts", "w").write('''/**
 * What this host composes, and how it authenticates.
 *
 * The kernel keeps registries it never populates itself: NextAuth's options,
 * the permission catalog's capability sets, and the manifests of every module
 * as they are extracted. This file is the one place that fills them for this
 * host. Imported once at boot from `instrumentation.ts`, and by any test that
 * reads a registry.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import { registerCapabilities } from "@corelithzw/platform/permission-catalog";
import { authOptions } from "@/lib/auth";
import { CRM_CAPABILITY_SET } from "@/lib/crm/permissions";

registerAuthOptions(() => authOptions);
registerCapabilities(CRM_CAPABILITY_SET);
''')
    open(f"{APP}/instrumentation.ts", "w").write('''export async function register() {
  // Registrations the Node runtime needs before it serves a request. The
  // proxy runs on the edge runtime and reads none of them.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./modules");
  }
}
''')
    edit(f"{HOST}/permission-catalog.test.ts", [
        ('} from "./permission-catalog";', '} from "@corelithzw/platform/permission-catalog";', 1),
        ('import { describe, it, expect, vi, beforeEach } from "vitest";\n', 'import { describe, it, expect, vi, beforeEach } from "vitest";\nimport "@/modules";\n', 1),
    ])
    edit(f"{APP}/vitest.setup.ts", [
        ('''if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
''', '''if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// Boot the host the way instrumentation.ts does, but lazily: the kernel asks
// the host for NextAuth's options through a registry, and a test that reaches
// a guard needs an answer. The import is deferred to first use so a test's own
// mocks of `@/lib/auth` and its graph still apply.
registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);
''', 1),
        ('import { config as loadEnv } from "dotenv";\n', 'import { config as loadEnv } from "dotenv";\nimport { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";\n', 1),
    ])
    print("seams done")

# ---- package files -------------------------------------------------------------------------
if want("pkg"):
    app_pkg = json.load(open(f"{APP}/package.json")); deps = app_pkg["dependencies"]; dev = app_pkg["devDependencies"]
    pkg = collections.OrderedDict([
        ("name", "@corelithzw/platform"), ("version", "0.0.0"), ("private", True),
        ("description", "The kernel: tenancy, entitlements and feature gating, the auth core, roles, API utilities, money, ids, uploads, preferences. Depends on db only; never on a module or a host."),
        ("main", "./index.ts"), ("types", "./index.ts"),
        ("scripts", collections.OrderedDict([("lint", "eslint"), ("typecheck", "tsc --noEmit -p tsconfig.json"), ("test", "vitest run")])),
        ("dependencies", collections.OrderedDict(sorted({
            "@corelithzw/db": "workspace:*", "@vercel/blob": deps["@vercel/blob"], "next-auth": deps["next-auth"]}.items()))),
        ("peerDependencies", collections.OrderedDict([("next", deps["next"]), ("react", deps["react"]), ("react-dom", deps["react-dom"])])),
        ("devDependencies", collections.OrderedDict(sorted({
            "@corelithzw/config": "workspace:*", "@types/node": dev["@types/node"], "@types/react": dev["@types/react"],
            "@types/react-dom": dev["@types/react-dom"], "dotenv": deps["dotenv"], "eslint": dev["eslint"],
            "eslint-config-next": dev["eslint-config-next"], "next": deps["next"], "react": deps["react"], "react-dom": deps["react-dom"],
            "typescript": dev["typescript"], "vitest": dev["vitest"]}.items()))),
    ])
    json.dump(pkg, open(f"{PKG}/package.json", "w"), indent=2); open(f"{PKG}/package.json", "a").write("\n")
    open(f"{PKG}/tsconfig.json", "w").write('{\n  "extends": "@corelithzw/config/tsconfig/nextjs.json",\n  "compilerOptions": {\n    "types": ["vitest/globals"]\n  },\n  "include": ["**/*.ts", "**/*.tsx"],\n  "exclude": ["node_modules"]\n}\n')
    open(f"{PKG}/vitest.config.ts", "w").write('import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n    globals: true,\n    setupFiles: ["./vitest.setup.ts"],\n    include: ["**/*.test.ts", "**/*.test.tsx"],\n    exclude: ["node_modules"],\n  },\n});\n')
    open(f"{PKG}/vitest.setup.ts", "w").write('// The repository-root .env, as the hosts read it (a .env beside this package\n// wins), then the test database before Prisma creates its pool.\nimport path from "node:path";\nimport { config as loadEnv } from "dotenv";\n\nloadEnv({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../.env")], quiet: true });\n\nif (process.env.DATABASE_URL_TEST) {\n  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;\n}\n')
    open(f"{PKG}/eslint.config.mjs", "w").write('import { defineConfig, globalIgnores } from "eslint/config";\nimport nextVitals from "eslint-config-next/core-web-vitals";\nimport nextTs from "eslint-config-next/typescript";\n\n// The same rules as the hosts, so a module reads the same wherever it lives.\nexport default defineConfig([...nextVitals, ...nextTs, globalIgnores(["node_modules/**"])]);\n')
    open(f"{PKG}/index.ts", "w").write('''// Deep imports are the norm (`@corelithzw/platform/api-utils`); this entry
// carries what a host needs by name to compose itself.
export { registerAuthOptions, type AuthOptionsProvider } from "./auth-core/auth-options";
export { registerCapabilities, type CapabilitySet } from "./permission-catalog";
export type { AuthenticatedSession } from "./auth-core/types";
''')
    open(f"{PKG}/README.md", "w").write('''# @corelithzw/platform

The kernel: what every host and every module stands on and none of them own.

```
tenant, entitlements, features, feature-catalog, client-templates, subscription, personas, …
                    tenancy, and what a tenant may use
gating/             route registry, capability registry, enforcer, token checks, the nav filter
auth-core/          guards, the lean API guard, token sessions, role routes, session claims and policy
admin-portal(.ts)   the control-plane host: who is a superuser, which host is the admin portal
permission-catalog  what a person may do: features from entitlements, capabilities from the modules
registry            the registries a host fills at boot
roles, public-routes, api-utils, api-response, api-client, logging, observability/
id-generator, money, serialize-decimals, uploads/, preferences/, audit/, workspace-products
```

Import by path: `import { validateSession } from "@corelithzw/platform/api-utils"`.

## Rules

- Depends on `@corelithzw/db` and nothing else in the workspace: never on a
  module, never on a host.
- The kernel never names a module or a host. Where it needs what only they
  know, it keeps a registry they fill: `registerAuthOptions` for how the host
  authenticates, `registerCapabilities` for what its modules let a person do,
  the module manifests as they arrive. A host fills them at boot in its
  `modules.ts`, imported from `instrumentation.ts`; a test that reads a
  registry imports the same file.
- NextAuth's options themselves stay in the host (`apps/legacy/lib/auth.ts`):
  they name the host's providers and adapter, and one callback asks the retail
  module a question.
''')
    print("pkg files written")

# ---- host wiring ---------------------------------------------------------------------------
if want("host"):
    p = f"{APP}/next.config.ts"; s = open(p).read()
    s2 = re.sub(r'transpilePackages:\s*\[([^\]]*)\]', 'transpilePackages: ["@corelithzw/db", "@corelithzw/ui", "@corelithzw/platform"]', s, count=1)
    assert s2 != s; open(p, "w").write(s2)
    p = f"{APP}/package.json"; d = json.load(open(p), object_pairs_hook=collections.OrderedDict)
    d["dependencies"]["@corelithzw/platform"] = "workspace:*"; d["dependencies"] = collections.OrderedDict(sorted(d["dependencies"].items()))
    json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")
    print("host wired")

if want("check"):
    left = collections.Counter()
    for path in walk(PKG):
        for m in re.finditer(r'["\']@/[^"\']+["\']', open(path).read()): left[m.group(0)] += 1
    print("unresolved '@/' inside packages/platform:", dict(left) or "none")
