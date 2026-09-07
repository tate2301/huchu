#!/usr/bin/env python3
"""3.1c: apps/campus, the Campus host — a module list, its own data files, the kernel's proxy and auth, composed routes and pages."""
import os, re, json, subprocess, sys, shutil
ROOT = "/home/user/huchu"; LEG = f"{ROOT}/apps/legacy"; CAM = f"{ROOT}/apps/campus"; PK = f"{ROOT}/packages"
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def read(p): return open(p).read()
def write(p, s): os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(s)
def copy(rel, dst_rel=None, transform=None):
    src = f"{LEG}/{rel}"; dst = f"{CAM}/{dst_rel or rel}"
    s = read(src); s = transform(s) if transform else s
    write(dst, s); return dst
def prune_named_imports(s, module):
    m = re.search(r'import (type )?\{\n((?:  .*\n)+?)\} from "' + re.escape(module) + r'";\n', s)
    if not m: return s
    rest = s[:m.start()] + s[m.end():]
    kept = [line for line in m.group(2).splitlines() if re.search(r'\b' + re.escape(line.strip().rstrip(",").split(" ")[-1]) + r'\b', rest)]
    return s[:m.start()] + 'import ' + (m.group(1) or "") + '{\n' + "\n".join(kept) + '\n} from "' + module + '";\n' + s[m.end():]
def prune_icon_imports(s): return prune_named_imports(s, "@corelithzw/ui/lib/icons")
def edit(s, old, new, count=1, where=""):
    n = s.count(old); assert n == count, f"{where}: expected {count} of {old[:60]!r}, found {n}"
    return s.replace(old, new)

MODULES = ["workflow", "notifications", "offline", "records", "documents", "books", "people", "compliance", "campus"]
PACKAGES = ["@corelithzw/db", "@corelithzw/ui", "@corelithzw/platform", "@corelithzw/shell"] + [f"@corelithzw/module-{m}" for m in MODULES]

# --- package.json: the legacy app's, trimmed to what this host composes and runs
legacy = json.load(open(f"{LEG}/package.json"))
pkg = {
    "name": "@corelithzw/campus",
    "version": "0.1.0",
    "private": True,
    "description": "The Campus host: the school product, composed from the school module, the books, compliance, people, documents, notifications, records and the offline runtime on the kernel and the shell.",
    "scripts": {k: legacy["scripts"][k] for k in ("dev", "build", "start", "lint", "typecheck", "test", "test:watch")},
    "dependencies": {},
    "devDependencies": {},
}
KEEP_DEPS = set(PACKAGES) | {
    "@corelithzw/react", "@rtcamp/frappe-ui-react", "@tanstack/react-query", "@vercel/analytics", "dotenv", "next", "next-auth",
    "react", "react-dom", "@sparticuz/chromium", "puppeteer-core", "@phosphor-icons/react",
}
KEEP_DEV = {"@corelithzw/config", "@svgr/webpack", "@tailwindcss/postcss", "@types/node", "@types/react", "@types/react-dom",
            "eslint", "eslint-config-next", "tailwindcss", "tw-animate-css", "typescript", "vitest"}
for name, ver in legacy["dependencies"].items():
    if name in KEEP_DEPS: pkg["dependencies"][name] = ver
for name in PACKAGES:
    pkg["dependencies"].setdefault(name, "workspace:*")
pkg["dependencies"] = dict(sorted(pkg["dependencies"].items()))
pkg["devDependencies"] = dict(sorted((k, v) for k, v in legacy["devDependencies"].items() if k in KEEP_DEV))
write(f"{CAM}/package.json", json.dumps(pkg, indent=2) + "\n")

# --- config files: the legacy app's, with what only it needs taken out
copy("tsconfig.json")
copy("postcss.config.mjs")
copy("vitest.config.ts")
copy("next-env.d.ts") if os.path.exists(f"{LEG}/next-env.d.ts") else None
copy("types/next-auth.d.ts")
copy("instrumentation.ts")
def next_config(s):
    s = edit(s, 'transpilePackages: ["@corelithzw/db", "@corelithzw/ui", "@corelithzw/platform", "@corelithzw/shell", "@corelithzw/module-workflow", "@corelithzw/module-notifications", "@corelithzw/module-records", "@corelithzw/module-documents", "@corelithzw/module-books", "@corelithzw/module-people", "@corelithzw/module-stock", "@corelithzw/module-maintenance", "@corelithzw/module-compliance", "@corelithzw/module-offline", "@corelithzw/module-gold", "@corelithzw/module-campus", "@corelithzw/module-sell", "@corelithzw/module-crm"],',
             "transpilePackages: " + json.dumps(PACKAGES) + ",", where="next.config transpilePackages")
    a = s.index("  // Legacy Gold route redirects"); b = s.index("export default nextConfig;")
    s = s[:a] + "};\n\n" + s[b:]
    s = s.replace("// This app is one workspace package.", "// The Campus host is one workspace package.")
    return s
copy("next.config.ts", transform=next_config)
def eslint(s):
    a = s.index("  {\n    // The type scale has a floor."); b = s.index("]);\n\nexport default eslintConfig;")
    rules = re.search(r'    rules: \{\n(?:.*\n)*?    \},\n', s[a:b]).group(0)
    block = ('  {\n    // The type scale has a floor: nothing under `text-sm`. This host\'s own\n'
             '    // components are the surfaces that have been brought up to it; the composed\n'
             '    // trees are the modules\' and are linted in their packages.\n'
             '    files: ["components/**/*.tsx"],\n' + rules + '  },\n')
    return s[:a] + block + s[b:]
copy("eslint.config.mjs", transform=eslint)
def vitest_setup(s):
    return s.replace("// Load this app's .env", "// Load this host's .env")
copy("vitest.setup.ts", transform=vitest_setup)

# --- the app tree's own files: styles, layout, metadata, the root page
for rel in ("app/globals.css", "app/themes/corelith-bridge.css", "app/themes/corelith-missing.css", "app/styles/components.css", "app/styles/design-system.css", "app/styles/tokens.css", "app/manifest.ts", "app/layout.tsx"):
    if os.path.exists(f"{LEG}/{rel}"): copy(rel)
write(f"{CAM}/app/page.tsx", '''import { redirect } from "next/navigation";

import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { getComputedWorkspaceHomeHref } from "@/lib/workspaces";

/**
 * The site root of a Campus host is the workspace: a signed-in person lands
 * on their home, a signed-out visitor at sign-in. The product's public site is
 * its own project on the bare domain; this host serves the schools.
 */
export default async function RootPage() {
  const session = await getCurrentAuthSession();
  if (session?.user) {
    redirect(
      getComputedWorkspaceHomeHref({
        role: session.user.role,
        enabledFeatures: session.user.enabledFeatures,
        workspaceProfile: session.user.workspaceProfile,
      }),
    );
  }
  redirect("/login");
}
''')
write(f"{CAM}/app/robots.ts", '''import type { MetadataRoute } from "next";

/** A workspace host: nothing on it is for a crawler. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
''')
for rel in ("public/icon-192.png", "public/icon-192.svg", "public/icon-512.png", "public/icon-512.svg", "public/manifest.json", "public/sw.js",
            "public/bold.37baf660.woff2", "public/medium.501e532c.woff2", "public/regular.4b554656.woff2"):
    if os.path.exists(f"{LEG}/{rel}"):
        os.makedirs(os.path.dirname(f"{CAM}/{rel}"), exist_ok=True); shutil.copy(f"{LEG}/{rel}", f"{CAM}/{rel}")

# --- providers, the app shell (no CRM, no stock), the command bar
copy("components/providers/app-providers.tsx")
def app_shell(s):
    s = edit(s, 'import { GlobalCommandBar } from "@/components/layout/command-bar/global-command-bar";\nimport { CrmMembers } from "@corelithzw/module-crm/components/crm-members";\nimport { SidebarCrmCollections } from "@corelithzw/module-crm/components/sidebar-crm-collections";\n',
             'import { GlobalCommandBar } from "@/components/layout/command-bar/global-command-bar";\n', where="app-shell crm imports")
    s = edit(s, 'import { fetchStockLocations } from "@corelithzw/module-stock/api-client";\nimport { canAccessCapabilityWithToken, hasTokenFeature } from "@corelithzw/platform/gating/token-check";\n',
             'import { canAccessCapabilityWithToken } from "@corelithzw/platform/gating/token-check";\n', where="app-shell stock import")
    s = edit(s, 'import { useQuery } from "@tanstack/react-query";\n', '', where="app-shell useQuery")
    a = s.index("  // Which stock surfaces are worth offering"); b = s.index("  const showNotificationCenter = ")
    s = s[:a] + '''  const resolveSidebarModel = React.useCallback((args: SidebarModelArgs) => getWorkspaceSidebarModel(args), []);
''' + s[b:]
    a = s.index("  // The CRM is the one module that is genuinely a shared book"); b = s.index("  const isAuthRoute = ")
    s = s[:a] + s[b:]
    s = edit(s, '        <AppSidebar resolveModel={resolveSidebarModel} collections={<SidebarCrmCollections />} />\n', '        <AppSidebar resolveModel={resolveSidebarModel} />\n', where="app-shell sidebar")
    s = edit(s, '            members={showMembers ? <CrmMembers className="mr-1" /> : null}\n', '', where="app-shell members")
    s = s.replace('    hostPortalPath === "/portal/teacher" ||\n    hostPortalPath === "/portal/pos";', '    hostPortalPath === "/portal/teacher";')
    assert "module-crm" not in s and "module-stock" not in s and "useQuery" not in s
    return s
copy("components/layout/app-shell.tsx", transform=app_shell)
copy("components/layout/command-bar/global-command-bar.tsx")
copy("components/layout/command-bar/command-previews.tsx")

# --- this host's data: navigation, management, the workspace catalogue, offline, auth
ALLOWED_PREFIXES = ["/", "/help", "/reports/attendance", "/reports/compliance-incidents", "/people", "/payroll", "/schools", "/management/master-data/schools",
                    "/management/master-data/hr", "/accounting", "/compliance", "/preferences", "/management/master-data", "/templates", "/dashboard", "/portal/parent", "/portal/student", "/portal/teacher"]
def allowed(href):
    return any(href == p or href.startswith(p + "/") for p in ALLOWED_PREFIXES) or href in ("/", "/help")
def navigation(s):
    # keep the sections whose items this host serves; an item's href decides
    out = []; sections = re.split(r'(?=\n  \{\n    id: ")', s)
    head = sections[0]; kept = 0; carried = ""
    for sec in sections[1:]:
        m = re.match(r'\n  \{\n    id: "([a-z-]+)"', sec); sid = m.group(1)
        if sid in ("daily", "maintenance", "stores", "retail", "retail-customers", "gold", "crm"):
            tail = re.search(r'((?:  //.*\n)+)$', sec + "\n"); carried = tail.group(1).rstrip("\n") if tail else ""
            continue
        if carried: sec = "\n" + carried + sec; carried = ""
        if sid == "reporting":
            lines = sec.split("\n"); keep_lines = []; skip = False
            for line in lines:
                hm = re.search(r'href: "([^"]+)"', line)
                if hm and not allowed(hm.group(1)) and "{ href:" in line: continue
                keep_lines.append(line)
            sec = "\n".join(keep_lines)
            # multi-line items for reports this host does not serve
            for href in ("/reports/stores-movements", "/reports/maintenance-work-orders", "/reports/maintenance-equipment", "/reports/gold-receipts", "/reports/downtime"):
                sec = re.sub(r'      \{\n        href: "' + re.escape(href) + r'",\n(?:        .*\n)*?      \},\n', "", sec)
            assert "/reports/gold" not in sec and "/reports/stores" not in sec and "maintenance" not in sec, sec
        out.append(sec); kept += 1
    s = head + "".join(out)
    s2 = re.sub(r'      \{\n        href: "/dashboard",\n(?:        .*\n)*?      \},\n', "", s); assert s2 != s, "no /dashboard item in settings"; s = s2
    s = prune_icon_imports(s)
    s = s.replace("// Who may reach People and Payroll at all. Mirrored as a Set in `proxy.ts`,\n// which checks it on the route prefix before the page renders.", "// Who may reach People and Payroll at all; the proxy checks it on the prefix\n// from the people module's manifest.")
    return s
copy("lib/navigation.ts", transform=navigation)
def management_nav(s):
    for iid in ("sections", "downtime-codes", "gold-expense-types", "scrap-materials", "scrap-sellers"):
        s2 = re.sub(r'    \{\n      id: "' + iid + r'",\n(?:      .*\n)*?    \},\n', "", s)
        s2 = re.sub(r'    \{ id: "' + iid + r'",[^\n]*\},\n', "", s2)
        s = s2
    assert "gold-expense-types" not in s and "scrap" not in s and "downtime" not in s, "management nav still names the mine"
    return prune_icon_imports(s)
copy("lib/settings/management-nav.ts", transform=management_nav)
def workspaces(s):
    # the catalogue: the modules this host composes, the profiles it serves
    for mod in ("gold", "retail", "crm", "stores", "maintenance"):
        s2 = re.sub(r'  ' + mod + r': createSectionModule\(\{\n(?:    .*\n)*?  \}\),\n', "", s)
        s2 = re.sub(r'  ' + mod + r': \{\n    id: "' + mod + r'",\n(?:(?:    .*|)\n)*?  \},\n', "", s2)
        s = s2
    for prof in ("GOLD_MINE", "RETAIL"):
        s = re.sub(r'  ' + prof + r': \{\n(?:(?:    .*|)\n)*?  \},\n', "", s)
    s = s.replace('import { canAccessPosPortal } from "@corelithzw/module-sell/pos-host";\n', "")
    s = re.sub(r'\n/\*\*\n \* Whether a stock transfer is a thing this workspace can actually do\.(?:.*\n)*?^}\n', "\n", s, flags=re.M)
    s = s.replace('  GOLD_MINE: "gold",\n', "").replace('  RETAIL: "retail",\n', "")
    s = s.replace("  GOLD_MINE: Gem,\n", "").replace("  RETAIL: MedusaBuildingStorefrontIcon,\n", "")
    s = s.replace("  Gem,\n", "").replace("  MedusaBuildingStorefrontIcon,\n", "")
    s = re.sub(r'const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId\[\] = \[\n(?:  .*\n)*?\];', 'const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId[] = [\n  "schools",\n  "people",\n  "payroll",\n  "accounting",\n  "management",\n  "reporting",\n];', s)
    s = re.sub(r'  // Retail surfaces on any retail feature or the till, not on one key\.\n  moduleGates: \{\n(?:    .*\n)*?  \},\n', "", s)
    s = s.replace(" * This host's workspace catalogue:", " * The Campus host's workspace catalogue:")
    a = s.index("export function getWorkspaceProfileForTemplate"); b = s.index("export function getWorkspaceHomeHref")
    s = s[:a] + '''export function getWorkspaceProfileForTemplate(code: string | null | undefined): WorkspaceProfile | null {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("SCHOOL")) return "SCHOOLS";
  if (normalized.includes("PAYROLL") || normalized.includes("BUREAU")) return "PAYROLL";
  // Every other template this platform has issued — the mine, the shop, the
  // retired ones — has no workspace of its own on this host: a tenant on one of
  // those codes gets the general workspace here rather than a null profile.
  return "GENERAL";
}

''' + s[b:]
    for must_not in ("gold", "retail", "crm", "stores", "maintenance", "canAccessPosPortal", "canReclassifyStock"):
        assert not re.search(r'\b' + must_not + r'\b', s.replace("// Retired profiles", "")), f"catalogue still names {must_not}"
    return prune_icon_imports(s)
copy("lib/workspaces.ts", transform=workspaces)
copy("lib/auth.ts")
copy("lib/host/manifests.test.ts", transform=lambda s: s.replace('toContain("crm")', 'toContain("schools")'))
def offline_modules(s):
    a = s.index("  {\n    moduleId: \"retail-pos\","); b = s.index("];\n", a)
    s = s[:a] + s[b:]
    for name in ("retailPreloadQueries", "retailMutationAdapters", "syncRetailCustomer", "syncRetailSale", "normalizeLegacyDocumentNumber"):
        s = re.sub(r'\n(?:/\*\*(?:.*\n)*?\*/\n)?(?:async )?(?:function|const) ' + name + r'\b.*?\n(?:(?!\n(?:async )?(?:function|const|export) ).*\n)*', "\n", s, count=1)
    s = re.sub(r'^import \{[^}]*\} from "@corelithzw/module-offline/entity-store";\n', "", s, flags=re.M)
    s = re.sub(r'^import \{ asErrorMessage, isLikelyNetworkFailure \} from "@corelithzw/module-offline/module-registry";\n', "", s, flags=re.M)
    s = re.sub(r'^import \{ fetchJson \} from "@corelithzw/platform/api-client";\n', "", s, flags=re.M)
    assert "retail" not in s.lower().replace("retailer", ""), "offline modules still name the till"
    return prune_named_imports(s, "@corelithzw/module-offline/types")
copy("lib/host/offline-modules.ts", transform=offline_modules)
def offline_workflows(s):
    a = s.index("  /**\n   * The till."); b = s.index("];\n", a)
    s = s[:a] + s[b:]
    s = re.sub(r'/\*\*\n \* The POS portal,(?:.*\n)*?\];\n\n', "", s)
    s = s.replace('  "/gold/settlement/approvals":\n    "Settlement approvals need tighter server coordination and are excluded.",\n', "")
    s = s.replace('    excludedRoutes: ["/gold/settlement/approvals"],\n', "")
    assert "RETAIL_POS_ROUTES" not in s and "gold" not in s
    return re.sub(r'^import type \{ OfflineMutationPolicy, OfflineWorkflowCatalogEntry \} from', 'import type { OfflineWorkflowCatalogEntry } from', s, flags=re.M) if "OfflineMutationPolicy" not in s.split("\n", 8)[-1] else s
copy("lib/host/offline-workflows.ts", transform=offline_workflows)
copy("modules.client.ts")

# --- composition: manifests, modules, the proxy
write(f"{CAM}/manifests.ts", '''/**
 * What the Campus host composes.
 *
 * The manifests of the modules this host runs, handed to the kernel's
 * registry. Data only — nothing here reaches a database — so the file is
 * imported wherever the registries are read: at boot on the server
 * (`modules.ts`), by the providers in the browser (`app-providers.tsx`), and
 * by the proxy on the edge. `lib/host/manifests.test.ts` keeps it that way.
 */
import { registerModules, unmetModuleRequirements } from "@corelithzw/platform/manifest";
import { registerManagementNavigation } from "@corelithzw/shell/management";
import { registerNavigationSections } from "@corelithzw/shell/navigation";
import { navSections } from "@/lib/navigation";
import { areaLabels, areaNavItems, managementModuleItems } from "@/lib/settings/management-nav";
import { manifest as workflow } from "@corelithzw/module-workflow/manifest";
import { manifest as notifications } from "@corelithzw/module-notifications/manifest";
import { manifest as offline } from "@corelithzw/module-offline/manifest";
import { manifest as records } from "@corelithzw/module-records/manifest";
import { manifest as documents } from "@corelithzw/module-documents/manifest";
import { manifest as books } from "@corelithzw/module-books/manifest";
import { manifest as people } from "@corelithzw/module-people/manifest";
import { manifest as compliance } from "@corelithzw/module-compliance/manifest";
import { manifest as schools } from "@corelithzw/module-campus/manifest";

registerModules([workflow, notifications, offline, records, documents, books, people, compliance, schools]);

// The navigation model is data the host owns; the chrome reads it here.
registerNavigationSections(navSections);
registerManagementNavigation({ modules: managementModuleItems, areas: areaNavItems, labels: areaLabels });

const unmet = unmetModuleRequirements();
if (unmet.length > 0) {
  throw new Error(
    `This host composes modules that require others it does not compose: ${unmet
      .map((entry) => `${entry.module} requires ${entry.requires}`)
      .join("; ")}.`,
  );
}
''')
write(f"{CAM}/modules.ts", '''/**
 * How the Campus host is wired: the code its modules hook into each other
 * with, and how it authenticates. What it composes is `manifests.ts`,
 * imported first. Server only; imported once at boot from
 * `instrumentation.ts`, and by any test that reads a registry filled here.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import "./manifests";
import "./modules.client";
import { onFiscalBacklog, registerFiscalDrainIssuer, registerFiscalDrainSweep } from "@corelithzw/module-books/fiscal-drain";
import { registerDocumentSource } from "@corelithzw/module-documents/source-registry";
import { registerSearchArm } from "@corelithzw/module-records/search";
import { registerRecordSubjectGuard } from "@corelithzw/module-records/subject-guard";
import { onApprovalAction } from "@corelithzw/module-workflow/approvals";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

// After an approval action: the people the entity concerns are told. The
// people module's entities are the only approvable ones this host runs.
onApprovalAction(async (tx, event) => {
  const { emitPeopleApprovalNotification } = await import("@corelithzw/module-people/approval-notifications");
  await emitPeopleApprovalNotification(tx, event);
});

// Who may file against a record: the school decides for its record types.
registerRecordSubjectGuard("schools", async (session, action) => (await import("@corelithzw/module-campus/record-guard")).schoolRecordGuard(session, action));

// The search box's arms: the school's records and the staff directory.
registerSearchArm({
  id: "schools",
  run: async (db, input) => {
    const { searchSchools } = await import("@corelithzw/module-campus/search");
    return searchSchools(db, { ...input, types: input.types as Parameters<typeof searchSchools>[1]["types"] });
  },
});
registerSearchArm({
  id: "people",
  run: async (db, input) => {
    const { searchPeople } = await import("@corelithzw/module-people/people/search");
    return searchPeople(db, { ...input, types: input.types as Parameters<typeof searchPeople>[1]["types"] });
  },
});

// Where each printable document's content comes from, by the module that owns
// the records: the school's paper, the payslip, the books' sales documents.
registerDocumentSource({
  id: "schools",
  matches: (key) => key.startsWith("schools."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-campus/document-sources")).schoolDocumentFeatureKeys(key) }),
  authorize: async (input) => (await import("@corelithzw/module-campus/document-sources")).authorizeSchoolDocument(input),
  resolve: async (input) => {
    const { isSchoolDocumentSourceKey, resolveSchoolDocument } = await import("@corelithzw/module-campus/document-sources");
    if (!isSchoolDocumentSourceKey(input.sourceKey)) throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
    return resolveSchoolDocument(input.companyId, { ...input, sourceKey: input.sourceKey });
  },
});
registerDocumentSource({
  id: "hr",
  matches: (key) => key.startsWith("hr."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-people/hr/document-sources")).hrDocumentFeatureKeys(key) }),
  authorize: async (input) => (await import("@corelithzw/module-people/hr/document-sources")).authorizeHrDocument(input),
  resolve: async (input) => {
    const { isHrDocumentSourceKey, resolveHrDocumentSource } = await import("@corelithzw/module-people/hr/document-sources");
    if (!isHrDocumentSourceKey(input.sourceKey)) throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
    return resolveHrDocumentSource({ ...input, sourceKey: input.sourceKey });
  },
});
registerDocumentSource({
  id: "books",
  matches: (key) => key.startsWith("accounting."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-books/document-sources")).booksDocumentFeatureKeys(key) }),
  resolve: async (input) => (await import("@corelithzw/module-books/document-sources")).resolveBooksDocument(input),
});

// The fiscal drain re-issues the school's fee receipts and sweeps the ones a
// crash left unfiscalised; a stuck tenant becomes a compliance incident.
registerFiscalDrainIssuer("schoolFeeReceipt", async (args) => {
  const { issueSchoolFeeReceiptFiscalisation } = await import("@corelithzw/module-campus/fiscalisation");
  const result = await issueSchoolFeeReceiptFiscalisation(args);
  return { status: result.fiscalStatus, error: result.fiscalError ?? null };
});
registerFiscalDrainSweep("schoolFeeReceipt", {
  unattempted: async (args) => (await import("@corelithzw/module-campus/fiscalisation")).unattemptedSchoolFeeReceipts(args),
});
onFiscalBacklog(async (event) => {
  const [{ emitIncidentNotification }, { prisma }] = await Promise.all([
    import("@corelithzw/module-compliance/notifications"),
    import("@corelithzw/db/client"),
  ]);
  await emitIncidentNotification(prisma, {
    companyId: event.companyId,
    actorId: event.actorId,
    event: "CREATED",
    incident: {
      id: event.incidentId,
      incidentType: event.title,
      severity: "CRITICAL",
      status: "OPEN",
      site: { name: "Fiscalisation", code: "fiscalisation" },
    },
  });
});
''')
write(f"{CAM}/proxy.ts", '''/**
 * The Campus host's edge proxy: the kernel's, over the manifests this host
 * registers. The matcher is here because Next reads it statically; the
 * payroll and compliance APIs it names authenticate with a bare session and
 * need the proxy's gates.
 */
// The route registry reads the manifests, and the edge runtime has no boot hook.
import "@/manifests";
import { createProxy } from "@corelithzw/platform/proxy";

export default createProxy();

export const config = {
  matcher: [
    "/((?!api/auth|api|_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|js|json|webmanifest|txt|xml)).*)",
    "/api/payroll/:path*",
    "/api/compliance/:path*",
  ],
};
''')
write(f"{CAM}/app/api/v2/records/search/route.ts", '''import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getFeatureMap } from "@corelithzw/platform/features";
import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions";
import {
  PEOPLE_SEARCH_FEATURES,
  PEOPLE_SEARCH_RESOURCES,
  PEOPLE_SEARCH_TYPES,
  type PeopleSearchType,
} from "@corelithzw/module-people/people/search";
import { groupSearchResults, searchRecords, type SearchScope } from "@corelithzw/module-records/search";
import { canSchoolRoleDo } from "@corelithzw/module-campus/permissions";
import {
  SCHOOL_SEARCH_FEATURES,
  SCHOOL_SEARCH_RESOURCES,
  SCHOOL_SEARCH_TYPES,
  type SchoolSearchType,
} from "@corelithzw/module-campus/search";

/**
 * One search box for the whole host.
 *
 * Host composition rather than a module's route: the arms are the modules this
 * host runs, and the scope handed to the records module names exactly those.
 * Under `/api/v2/records/**` because a URL prefix carries one feature gate and
 * this endpoint serves two modules, so it is reachable by any signed-in user
 * and decides for itself what that user may search — per arm, on both axes:
 * the FEATURE says the tenant bought it, the ROLE says this person may look.
 * An arm that fails either check is not run at all, and a caller with nothing
 * to search gets an empty result rather than a 403.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") ?? "").trim();
    if (query.length < 2) return successResponse({ query, groups: [], total: 0 });

    const limitPerType = Number(searchParams.get("limit") ?? 5);
    const companyId = session.user.companyId;

    // One read of the feature map for every arm rather than `hasFeature` per
    // type. A key missing from it is one the catalogue does not have, which
    // is not enabled either.
    const features = await getFeatureMap(companyId);
    const enabled = (key: string) => features[key] === true;

    const role = session.user.role;
    const schools: SchoolSearchType[] = SCHOOL_SEARCH_TYPES.filter(
      (type) =>
        enabled(SCHOOL_SEARCH_FEATURES[type]) &&
        canSchoolRoleDo(role, SCHOOL_SEARCH_RESOURCES[type], "view"),
    );
    // `hrPermissionDenial` returns a message when refused and null when
    // allowed, the inverse of `canSchoolRoleDo` — hence the `=== null`.
    const people: PeopleSearchType[] = PEOPLE_SEARCH_TYPES.filter(
      (type) =>
        enabled(PEOPLE_SEARCH_FEATURES[type]) &&
        hrPermissionDenial(session, PEOPLE_SEARCH_RESOURCES[type], "view") === null,
    );

    const scope: SearchScope = { schools, people };

    const results = await searchRecords(prisma, {
      companyId,
      query,
      limitPerType: Number.isFinite(limitPerType) ? Math.min(Math.max(limitPerType, 1), 20) : 5,
      scope,
    });

    return successResponse({
      query,
      groups: groupSearchResults(results),
      total: results.length,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/records/search error:", error);
    return errorResponse("Search failed");
  }
}
''')
write(f"{CAM}/README.md", '''# @corelithzw/campus

The Campus host: the school product on its own Vercel project and host
(`*.campus.corelith.co.zw`), composed from the school module and what it
requires — the books, compliance, people, documents, notifications, records,
workflow and the offline runtime — on the kernel and the shell.

What is written here by hand is this host's own: its module list
(`manifests.ts`), its wiring (`modules.ts`, `modules.client.ts`), its
navigation, management areas and workspace catalogue (`lib/`), its offline
scope (`lib/host/`), the app shell it renders (`components/`), its styles,
root layout and root page, and the search box's route (`app/api/v2/records/
search`), whose arms are the modules this host runs. Everything else under
`app/` is composed:
`pnpm compose apps/campus platform shell campus books compliance documents
notifications people records offline` writes one re-export per route and page.
''')
print("scaffolded apps/campus")
