#!/usr/bin/env python3
"""3.1b-3: the kernel's routes, the auth options and the proxy as kernel code, composed by the host.
Steps: manifests auth proxy routes compose deps check (default: all)."""
import os, re, json, subprocess, sys
ROOT = "/home/user/huchu"; APP = f"{ROOT}/apps/legacy"; PK = f"{ROOT}/packages"; PL = f"{PK}/platform"; MOD = f"{PK}/modules"
steps = sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def read(p): return open(p).read()
def write(p, s): os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(s)
def guarded(p, old, new, count=1):
    """An edit that may already have been made: skipped when its result is in place."""
    if new in read(p): return
    edit(p, old, new, count)
def edit(p, old, new, count=1):
    s = read(p); n = s.count(old)
    assert n == count, f"{os.path.relpath(p, ROOT)}: expected {count} of {old[:70]!r}, found {n}"
    write(p, s.replace(old, new))
def walk(base, exts=(".ts", ".tsx")):
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in ("node_modules", ".next", ".turbo")]
        for f in fn:
            if f.endswith(exts): yield os.path.join(dp, f)
def move_tree(src, dst):
    if not os.path.exists(src):
        assert os.path.exists(dst), f"neither {src} nor {dst} exists"; return
    if os.path.isfile(src):
        os.makedirs(os.path.dirname(dst), exist_ok=True); sh(f'git mv "{src}" "{dst}"'); return
    for dp, dn, fn in os.walk(src):
        rel = os.path.relpath(dp, src); target = os.path.join(dst, rel) if rel != "." else dst
        os.makedirs(target, exist_ok=True)
        for f in fn: sh(f'git mv "{os.path.join(dp, f)}" "{os.path.join(target, f)}"')
    sh(f'rm -rf "{src}"')
def relativise(pkg_dir, spec_prefix):
    m = 0
    for p in walk(pkg_dir):
        s = read(p); d = os.path.dirname(p)
        def repl(mm):
            t = mm.group(2)
            if not t.startswith(spec_prefix): return mm.group(0)
            r = os.path.relpath(os.path.join(pkg_dir, t[len(spec_prefix):]), d)
            return f'{mm.group(1)}{r if r.startswith(".") else "./" + r}{mm.group(1)}'
        new = re.compile(r'(["\'])(' + re.escape(spec_prefix) + r'[^"\']+)\1').sub(repl, s)
        if new != s: write(p, new); m += 1
    return m

KERNEL_API = ["api/auth", "api/ids", "api/onboarding", "api/preferences", "api/settings", "api/sites", "api/uploads", "api/users",
              "api/v2/health", "api/v2/platform", "api/workspace-app-icon"]

if want("manifests"):
    # the portals and the role-restricted routes a module brings, as manifest data the proxy and the auth read
    mf = f"{PL}/manifest.ts"
    if "export type PortalEntry" in read(mf): print("kernel manifest already extended")
    else: edit(mf, "export type ModuleManifest = {\n", '''/**
 * A portal a module serves on its own host (`pos-<slug>.<root>`), by the
 * kernel's portal-host key. The proxy sends the portal's roles home to it,
 * pins them to its host when asked, and serves its public paths bare; the
 * sign-in refuses roles the portal does not admit.
 */
export type PortalEntry = {
  key: PortalHostKey;
  /** Roles whose home is this portal: sent there from anywhere else on the host. */
  homeRoles: readonly string[];
  /** Roles that may sign in on the portal's host; any role when absent. */
  signInRoles?: readonly string[];
  /** The reason the sign-in gives a role the portal does not admit. */
  signInDeniedReason?: string;
  /** Paths the portal serves bare on its host, `/` included; a portal without them serves its internal tree. */
  publicPaths?: readonly string[];
  /** Whether the portal's roles are kept on the portal host even when they arrive on the tenant host. */
  pinRolesToHost?: boolean;
};

/** Routes only some roles may reach, enforced on the edge before any page or handler runs. */
export type RoleRestrictedRoutes = {
  paths: readonly string[];
  roles: readonly string[];
  message: string;
};

export type ModuleManifest = {
''')
    guarded(mf, '''  notifications?: {
    /** Where a notice about one of the module's entities opens: entity type → path template with `{id}`. */
    viewPaths?: Readonly<Record<string, string>>;
    /** What an approver can do from the notice itself: notification type → action templates. */
    approvalActions?: Readonly<Record<string, readonly NotificationActionTemplate[]>>;
  };
};
''', '''  notifications?: {
    /** Where a notice about one of the module's entities opens: entity type → path template with `{id}`. */
    viewPaths?: Readonly<Record<string, string>>;
    /** What an approver can do from the notice itself: notification type → action templates. */
    approvalActions?: Readonly<Record<string, readonly NotificationActionTemplate[]>>;
  };
  /** The portals the module serves on their own hosts. */
  portals?: readonly PortalEntry[];
  /** Routes only some roles may reach. */
  roleRestrictedRoutes?: readonly RoleRestrictedRoutes[];
};
''')
    guarded(mf, '''/** Every route the registered modules gate; the route registry reads these beside its own. */''', '''/** Every portal the registered modules serve. */
export function registeredPortals(): PortalEntry[] {
  return registeredModules().flatMap((manifest) => [...(manifest.portals ?? [])]);
}

export function registeredPortal(key: PortalHostKey): PortalEntry | undefined {
  return registeredPortals().find((portal) => portal.key === key);
}

/** Every role-restricted route the registered modules declare. */
export function registeredRoleRestrictedRoutes(): RoleRestrictedRoutes[] {
  return registeredModules().flatMap((manifest) => [...(manifest.roleRestrictedRoutes ?? [])]);
}

/** Every route the registered modules gate; the route registry reads these beside its own. */''')
    guarded(mf, 'import { registry } from "./registry";\n', 'import type { PortalHostKey } from "./portal-hosts";\nimport { registry } from "./registry";\n')
    # campus: the three portals; sell: the POS portal; people: the workforce routes
    cm = f"{MOD}/campus/manifest.ts"; s = read(cm)
    assert "portals:" not in s
    edit(cm, '  requires: [', '''  portals: [
    { key: "parent", homeRoles: ["PARENT"] },
    { key: "student", homeRoles: ["STUDENT"] },
    { key: "teacher", homeRoles: ["TEACHER"] },
  ],
  requires: [''')
    sm = f"{MOD}/sell/manifest.ts"; s = read(sm)
    assert "portals:" not in s
    edit(sm, '  requires: [', '''  portals: [
    {
      key: "pos",
      homeRoles: ["POS_CASHIER", "CASHIER"],
      signInRoles: ["CASHIER", "POS_CASHIER"],
      signInDeniedReason: "POS_PORTAL_ACCESS_REQUIRED",
      publicPaths: POS_ALL_PUBLIC_PATHS,
      pinRolesToHost: true,
    },
  ],
  requires: [''')
    s = read(sm)
    s = re.sub(r'^(import [^\n]*\n)', r'\1import { POS_ALL_PUBLIC_PATHS } from "./pos-host";\n', s, count=1, flags=re.M)
    write(sm, s)
    pm = f"{MOD}/people/manifest.ts"; s = read(pm)
    assert "roleRestrictedRoutes:" not in s
    edit(pm, '  requires: [', '''  // Checked on the prefix by the proxy, so a school teacher signing into a
  // tenant that also runs payroll cannot reach the salary bill by typing the URL.
  roleRestrictedRoutes: [
    { paths: ["/people", "/payroll"], roles: ["SUPERADMIN", "MANAGER", "CLERK"], message: "People and payroll access is restricted" },
  ],
  requires: [''')
    print("manifests: portals and role-restricted routes declared")

if want("auth"):
    # the auth options are the kernel's; what the retail module knew is portal data now
    src = f"{APP}/lib/auth.ts"; dst = f"{PL}/auth-core/create-auth-options.ts"
    move_tree(src, dst)
    s = read(dst)
    done = "export function createAuthOptions" in s
    old = 'import { canAccessPosPortal } from "@corelithzw/module-sell/pos-host";\n'
    if not done:
        assert s.count(old) == 1; s = s.replace(old, 'import { registeredPortalByPrefix } from "../manifest";\n')
        old = '''        if (
              hostContext.portalCanonicalPrefix === "pos" &&
              !canAccessPosPortal(user.role)
            ) {
              await logAuthEvent({
                eventType: "auth.login.failed",
                actor: email,
                companyId: user.companyId,
                reason: "POS_PORTAL_ACCESS_REQUIRED",
                entityType: "auth-strategy",
                entityId: "credentials",
                payload: { hostHeader, clientAddress },
              });
              throw new Error("POS_PORTAL_ACCESS_REQUIRED");
            }
    '''
        new = '''        // A portal host admits the roles its module says it does (`signInRoles`
            // in the manifest): a cashier signs in on the till's host, a bookkeeper
            // does not.
            const portal = registeredPortalByPrefix(hostContext.portalCanonicalPrefix);
            if (portal?.signInRoles && !portal.signInRoles.includes(user.role?.trim().toUpperCase() ?? "")) {
              const reason = portal.signInDeniedReason ?? "PORTAL_ACCESS_REQUIRED";
              await logAuthEvent({
                eventType: "auth.login.failed",
                actor: email,
                companyId: user.companyId,
                reason,
                entityType: "auth-strategy",
                entityId: "credentials",
                payload: { hostHeader, clientAddress },
              });
              throw new Error(reason);
            }
    '''
        assert s.count(old) == 1; s = s.replace(old, new)
        head_old = "validateAuthConfiguration();\n\nexport const authOptions: NextAuthOptions = {\n"
        tail_old = "\n};\n\nexport { isAuthExpired, type PlatformJwtClaims, type SessionPolicy };\n"
        assert s.count(head_old) == 1 and s.count(tail_old) == 1
        a0 = s.index(head_old) + len(head_old); b0 = s.index(tail_old)
        body = "".join(("  " + line if line.strip() else line) for line in (s[a0:b0] + "\n").splitlines(True))
        s = s[:s.index(head_old)] + '''/**
     * How a host authenticates. The providers, the adapter, the callbacks and the
     * secret are the kernel's; what a module knows — which roles a portal admits —
     * is data in its manifest. A host builds its options once
     * (`createAuthOptions()`) and registers them (`registerAuthOptions`).
     */
    export function createAuthOptions(): NextAuthOptions {
      validateAuthConfiguration();
      return {
    ''' + body + "  };\n}\n" + s[b0 + len(tail_old):]
        # inside the kernel the kernel's own paths are relative
        write(dst, s)
        relativise(PL, "@corelithzw/platform/")
        s = read(dst)
        assert '"@corelithzw/platform/' not in s and "canAccessPosPortal" not in s and "POS_PORTAL_ACCESS_REQUIRED" not in s
    # the manifest answers by prefix
    guarded(f"{PL}/manifest.ts", "export function registeredPortal(key: PortalHostKey): PortalEntry | undefined {", '''export function registeredPortalByPrefix(prefix: string | null | undefined): PortalEntry | undefined {
  const descriptor = getPortalHostDescriptorByPrefix(prefix);
  return descriptor ? registeredPortal(descriptor.key) : undefined;
}

export function registeredPortal(key: PortalHostKey): PortalEntry | undefined {''')
    guarded(f"{PL}/manifest.ts", 'import type { PortalHostKey } from "./portal-hosts";\n', 'import { getPortalHostDescriptorByPrefix, type PortalHostKey } from "./portal-hosts";\n')
    write(src, '''/**
 * How this host authenticates: the kernel's options, built once. The kernel
 * asks for them through `registerAuthOptions` (see `modules.ts`), and the
 * few host files that still read them by name read them here.
 */
import { createAuthOptions } from "@corelithzw/platform/auth-core/create-auth-options";
import { isAuthExpired } from "@corelithzw/platform/auth-core/session-policy";
import type { PlatformJwtClaims, SessionPolicy } from "@corelithzw/platform/auth-core/types";

export const authOptions = createAuthOptions();

export { isAuthExpired, type PlatformJwtClaims, type SessionPolicy };
''')
    print("auth options: kernel factory; host builds them")

if want("proxy"):
    src = f"{APP}/proxy.ts"; dst = f"{PL}/proxy.ts"
    s = read(src)
    head_old = '''// The route registry reads the manifests, and the edge runtime has no boot hook.
import "@/manifests";
import { withAuth } from "next-auth/middleware";
'''
    assert s.count(head_old) == 1
    s = s.replace(head_old, '''/**
 * The edge proxy every host runs: tenant hosts, portal hosts, the admin host,
 * the feature gates, the subscription's read-only degradation, the role
 * restrictions. What a module contributes — its portals, the routes only some
 * roles may reach — is data in its manifest, read here from the registry the
 * host filled before calling `createProxy()` (it imports its `manifests.ts`
 * first: the edge runtime has no boot hook). The matcher stays in the host's
 * `proxy.ts`, because Next reads it statically.
 */
import { withAuth } from "next-auth/middleware";
''')
    old = 'import { getPosHostForCompany, isCashierRole, isPublicPosPath } from "@corelithzw/module-sell/pos-host";\n'
    assert s.count(old) == 1
    s = s.replace(old, 'import { registeredPortal, registeredPortals, registeredRoleRestrictedRoutes, type PortalEntry } from "@corelithzw/platform/manifest";\n')
    old = '''const PORTAL_BASE_PATHS = ["/portal/parent", "/portal/student", "/portal/teacher", "/portal/pos", "/portal/admin"] as const;
'''
    assert s.count(old) == 1
    s = s.replace(old, '''/** The portal trees on this host: the registered modules' portals, and the admin portal the kernel serves. */
function portalBasePaths(): string[] {
  const modulePortals = registeredPortals().map((portal) => getPortalHostDescriptorByKey(portal.key).portalPath);
  return [...modulePortals, ADMIN_INTERNAL_BASE_PATH];
}
''')
    old = '''const PORTAL_HOME_BY_ROLE = {
  PARENT: "/portal/parent",
  STUDENT: "/portal/student",
  TEACHER: "/portal/teacher",
  POS_CASHIER: "/portal/pos",
  CASHIER: "/portal/pos",
} as const;
// Mirrors WORKFORCE_MODULE_ALLOWED_ROLES in `lib/navigation.ts`. Checked on the
// prefix here so a school teacher signing into a tenant that also runs payroll
// cannot reach the salary bill by typing the URL.
const WORKFORCE_MODULE_ALLOWED_ROLES = new Set(["SUPERADMIN", "MANAGER", "CLERK"]);
'''
    assert s.count(old) == 1; s = s.replace(old, "")
    old = '''function getPortalBasePathForPathname(pathname: string) {
  return PORTAL_BASE_PATHS.find((portalPath) => isPathWithinRoute(pathname, portalPath)) ?? null;
}

function getPortalHomeForRole(role: string | undefined | null) {
  if (!role) {
    return null;
  }

  if (
    role === "PARENT" ||
    role === "STUDENT" ||
    role === "TEACHER" ||
    role === "POS_CASHIER" ||
    role === "CASHIER"
  ) {
    return PORTAL_HOME_BY_ROLE[role as keyof typeof PORTAL_HOME_BY_ROLE];
  }

  return null;
}
'''
    assert s.count(old) == 1
    s = s.replace(old, '''function getPortalBasePathForPathname(pathname: string) {
  return portalBasePaths().find((portalPath) => isPathWithinRoute(pathname, portalPath)) ?? null;
}

/** The registered portal whose home this role is, if any. */
function portalHomeForRole(role: string | undefined | null): PortalEntry | null {
  if (!role) {
    return null;
  }
  const normalizedRole = role.trim().toUpperCase();
  return registeredPortals().find((portal) => portal.homeRoles.includes(normalizedRole)) ?? null;
}

function getPortalHomeForRole(role: string | undefined | null) {
  const portal = portalHomeForRole(role);
  return portal ? getPortalHostDescriptorByKey(portal.key).portalPath : null;
}

/** Whether a portal serves this path bare on its host (`/held` on the till, not `/portal/pos/held`). */
function isPublicPortalPath(portal: PortalEntry | undefined, pathname: string | null | undefined) {
  if (!portal?.publicPaths || !pathname) {
    return false;
  }
  return portal.publicPaths.some((allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`));
}
''')
    old = '''    if (!isApiRequest && token && isCashierRole(token.role)) {
      const posHost = getPosHostForCompany(token.companySlug, rootDomain);
      if (posHost && hostContext.hostname !== posHost && !isAdminHost) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        redirectUrl.search = "";
        return redirectAcrossHost(posHost, redirectUrl);
      }
    }
'''
    assert s.count(old) == 1
    s = s.replace(old, '''    // A portal that pins its roles to its host (the till): a cashier who lands
    // on the tenant host is sent to the portal host, whatever they asked for.
    const pinnedPortal = !isApiRequest && token ? portalHomeForRole(token.role) : null;
    if (pinnedPortal?.pinRolesToHost) {
      const companySlug = token?.companySlug?.trim().toLowerCase();
      const portalHost = companySlug && rootDomain ? buildPortalHost(getPortalHostDescriptorByKey(pinnedPortal.key).canonicalPrefix, companySlug, rootDomain) : null;
      if (portalHost && hostContext.hostname !== portalHost && !isAdminHost) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        redirectUrl.search = "";
        return redirectAcrossHost(portalHost, redirectUrl);
      }
    }
''')
    old = '''      const publicPortalPath = getPortalPublicPathForInternalPath(pathname, portalDescriptor);
      if (
        portalDescriptor.key === "pos" &&
        publicPortalPath &&
        isPublicPosPath(publicPortalPath)
      ) {
        return redirectToPathPreserveSearch(request, publicPortalPath);
      }

      if (portalDescriptor.key === "pos" && pathname.startsWith("/portal/pos")) {
        return redirectToPath(request, "/");
      }

      if (portalDescriptor.key === "pos" && !isPublicPosPath(pathname)) {
        return redirectToPath(request, "/");
      }
'''
    assert s.count(old) == 1
    s = s.replace(old, '''      // A portal with public paths (the till) serves them bare on its host and
      // nothing else: an internal path is sent to its public twin, or home.
      const portalEntry = registeredPortal(portalDescriptor.key);
      const publicPortalPath = getPortalPublicPathForInternalPath(pathname, portalDescriptor);
      if (portalEntry?.publicPaths && publicPortalPath && isPublicPortalPath(portalEntry, publicPortalPath)) {
        return redirectToPathPreserveSearch(request, publicPortalPath);
      }

      if (portalEntry?.publicPaths && pathname.startsWith(portalDescriptor.portalPath)) {
        return redirectToPath(request, "/");
      }

      if (portalEntry?.publicPaths && !isPublicPortalPath(portalEntry, pathname)) {
        return redirectToPath(request, "/");
      }
''')
    old = '''    if (
      token &&
      (isPathWithinRoute(pathname, "/people") ||
        isPathWithinRoute(pathname, "/payroll"))
    ) {
      if (!WORKFORCE_MODULE_ALLOWED_ROLES.has(token.role ?? "")) {
        return denyAccess(request, "People and payroll access is restricted");
      }
    }
'''
    assert s.count(old) == 1
    s = s.replace(old, '''    // Routes only some roles may reach, as the modules declare them.
    if (token) {
      for (const restriction of registeredRoleRestrictedRoutes()) {
        if (restriction.paths.some((path) => isPathWithinRoute(pathname, path)) && !restriction.roles.includes(token.role ?? "")) {
          return denyAccess(request, restriction.message);
        }
      }
    }
''')
    old = "export default withAuth(\n  async function proxy(request) {"
    assert s.count(old) == 1
    s = s.replace(old, "export function createProxy() {\n  return withAuth(\n  async function proxy(request) {")
    a = s.index("export const config = {")
    tail = s[a:]
    s = s[:a].rstrip("\n")
    assert s.endswith(");"), s[-40:]
    s = s + "\n}\n"
    # the descriptor by key
    s = s.replace('''import {
  buildPortalHost,
  getPortalHostDescriptorByPath,''', '''import {
  buildPortalHost,
  getPortalHostDescriptorByKey,
  getPortalHostDescriptorByPath,''', 1)
    write(dst, s)
    relativise(PL, "@corelithzw/platform/")
    ph = f"{PL}/portal-hosts.ts"
    if "export function getPortalHostDescriptorByKey" not in read(ph):
        edit(ph, "export function getPortalHostDescriptorByPrefix(", '''export function getPortalHostDescriptorByKey(key: PortalHostKey): PortalHostDescriptor {
  const descriptor = PORTAL_HOSTS.find((candidate) => candidate.key === key);
  if (!descriptor) throw new Error(`No portal host descriptor for ${key}`);
  return descriptor;
}

export function getPortalHostDescriptorByPrefix(''')
    write(src, '''/**
 * This host's edge proxy: the kernel's, over the manifests this host registers.
 * The matcher is here because Next reads it statically; the legacy APIs it
 * names authenticate with a bare session and need the proxy's gates.
 */
// The route registry reads the manifests, and the edge runtime has no boot hook.
import "@/manifests";
import { createProxy } from "@corelithzw/platform/proxy";

export default createProxy();

''' + tail)
    print("proxy: kernel createProxy; host composes")

if want("routes"):
    for d in KERNEL_API:
        move_tree(f"{APP}/app/{d}", f"{PL}/api/{d[len('api/'):]}")
    ar = f"{PL}/api/auth/[...nextauth]/route.ts"
    edit(ar, 'import { authOptions } from "@/lib/auth";\n', 'import { resolveAuthOptions } from "../../../auth-core/auth-options";\n')
    edit(ar, "const handler = NextAuth(authOptions);\n\nexport { handler as GET };\n", '''// The options are the host's to register (`registerAuthOptions`, at boot);
// the handler is built on the first request that needs it.
const handler: ReturnType<typeof NextAuth> = async (request, context) => NextAuth(await resolveAuthOptions())(request, context);

export { handler as GET };
''')
    for name in ("complete", "status"):
        p = f"{PL}/api/onboarding/{name}/route.ts"; s = read(p)
        s = s.replace("getServerSession(authOptions)", "getCurrentAuthSession()")
        s = re.sub(r'import \{ authOptions \} from "@/lib/auth";?\n', "", s)
        s = re.sub(r'import \{ getServerSession \} from "next-auth";?\n', 'import { getCurrentAuthSession } from "../../../auth-core/session";\n', s)
        assert "authOptions" not in s and "getServerSession" not in s, p
        write(p, s)
    relativise(PL, "@corelithzw/platform/")
    left = [os.path.relpath(p, PL) for p in walk(f"{PL}/api") if re.search(r'["\']@/', read(p))]
    assert not left, f"kernel routes still import host paths: {left}"
    print("kernel routes moved")

if want("compose"):
    cg = f"{ROOT}/scripts/compose-host.mjs"; s = read(cg)
    if "packages/platform" not in s:
        old = 'const ROOT = process.cwd();\n'
        assert s.count(old) == 1
        s = s.replace(old, '''const ROOT = process.cwd();
/** Where a package lives and what it is called: the kernel and the shell by name, a module under packages/modules. */
function packageOf(id) {
  if (id === "platform") return { dir: "packages/platform", name: "@corelithzw/platform" };
  if (id === "shell") return { dir: "packages/shell", name: "@corelithzw/shell" };
  return { dir: `packages/modules/${id}`, name: `@corelithzw/module-${id}` };
}
''')
        write(cg, s)
    s = read(cg)
    old1 = '  const base = join(ROOT, "packages", "modules", id);\n  const spec = `@corelithzw/module-${id}`;\n'
    if old1 in s:
        s = s.replace(old1, '  const { dir, name: spec } = packageOf(id);\n  const base = join(ROOT, dir);\n')
        s = s.replace('write(target, `export { ${names.join(", ")} } from "${from}";\\n`, id);', 'write(target, `export { ${names.join(", ")} } from "${from}";\\n`, spec);')
        s = s.replace('    write(target, body, id);\n', '    write(target, body, spec);\n')
        s = s.replace('function write(target, body, id) {\n  mkdirSync(dirname(target), { recursive: true });\n  const header = `// Composed from @corelithzw/module-${id} by scripts/compose-host.mjs; edit the module, then run it again.\\n`;',
                      'function write(target, body, spec) {\n  mkdirSync(dirname(target), { recursive: true });\n  const header = `// Composed from ${spec} by scripts/compose-host.mjs; edit the module, then run it again.\\n`;')
        s = s.replace(' *   node scripts/compose-host.mjs apps/legacy campus sell\n *\n',
                      ' *   node scripts/compose-host.mjs apps/legacy platform campus sell\n *\n * `platform` names the kernel (`packages/platform`, its routes under `api/`),\n * `shell` the workspace chrome (`packages/shell`, its pages under `pages/`);\n * any other id is a module under `packages/modules`.\n *\n')
        write(cg, s)
    s = read(cg)
    assert "packageOf(id)" in s and "@corelithzw/module-${id}" not in s, "composer patch incomplete"
    sh("node scripts/compose-host.mjs apps/legacy platform")
    print("compose-host: kernel and shell package roots; kernel routes composed")

if want("deps"):
    legacy = json.load(open(f"{APP}/package.json"))
    versions = {**legacy.get("devDependencies", {}), **legacy.get("dependencies", {})}
    pj = f"{PL}/package.json"; d = json.load(open(pj))
    have = set(d.get("dependencies", {})) | set(d.get("peerDependencies", {})) | set(d.get("devDependencies", {}))
    bare = set()
    for p in walk(PL):
        for m in re.finditer(r'from "([^"]+)"', read(p)):
            spec = m.group(1)
            if spec.startswith((".", "@/", "node:")): continue
            pkg = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
            if pkg in ("next", "react", "react-dom") or pkg in have or pkg in ("fs", "path", "crypto", "http", "stream", "buffer", "os", "url", "events", "util"): continue
            bare.add(pkg)
    added = []
    for pkg in sorted(bare):
        if pkg not in versions: print(f"!! platform: no version known for {pkg}"); continue
        dev = pkg.startswith("@types/")
        d.setdefault("devDependencies" if dev else "dependencies", {})[pkg] = versions[pkg]; added.append(pkg)
        if pkg == "bcryptjs" and "@types/bcryptjs" in versions and "@types/bcryptjs" not in have:
            d.setdefault("devDependencies", {})["@types/bcryptjs"] = versions["@types/bcryptjs"]; added.append("@types/bcryptjs")
    if added:
        for k in ("dependencies", "devDependencies"): d[k] = dict(sorted(d[k].items()))
        write(pj, json.dumps(d, indent=2) + "\n"); print("platform deps added:", added)

if want("check"):
    left = [os.path.relpath(p, PL) for p in walk(PL) if re.search(r'["\']@/', read(p))]
    print("kernel files importing '@/':", left or "none")
    mods = [os.path.relpath(p, PL) for p in walk(PL) if "@corelithzw/module-" in read(p)]
    print("kernel files naming a module:", mods or "none")
    api_left = sorted({os.path.relpath(p, f"{APP}/app") for p in walk(f"{APP}/app/api") if "Composed from" not in read(p)})
    print("host api files not composed:", len(api_left)); print("  " + "\n  ".join(api_left))
