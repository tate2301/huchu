#!/usr/bin/env python3
"""A product host from the legacy host and a spec: apps/<id> — a module list, its own data, the kernel's proxy and auth.

usage: scaffold_host.py <host id> [--out <dir>]   (host ids: campus, sell, crm, people)
"""
import os, re, json, sys, shutil, textwrap
ROOT = "/home/user/huchu"; LEG = f"{ROOT}/apps/enterprise"; PK = f"{ROOT}/packages"

HOSTS = {
    "campus": dict(
        Name="Campus", product="the school", subject="the school module", domain="campus.corelith.co.zw",
        description="The Campus host: the school product, composed from the school module, the books, compliance, people, documents, notifications, records and the offline runtime on the kernel and the shell.",
        modules=["workflow", "notifications", "offline", "records", "documents", "books", "people", "compliance", "campus"],
        compose=["platform", "shell", "campus", "books", "compliance", "documents", "notifications", "people", "records", "offline"],
        primary="schools",
        readme_what="the school module and what it requires — the books, compliance, people, documents, notifications, records, workflow and the offline runtime",
    ),
    "sell": dict(
        Name="Sell", product="the shop", subject="the till", domain="sell.corelith.co.zw",
        description="The Sell host: the retail product, composed from the sell module, stock, maintenance, compliance, the books, people, documents, notifications, records and the offline runtime on the kernel and the shell.",
        modules=["workflow", "notifications", "offline", "records", "documents", "books", "people", "stock", "maintenance", "compliance", "sell"],
        compose=["platform", "shell", "sell", "stock", "maintenance", "compliance", "books", "documents", "notifications", "people", "records", "offline"],
        primary="retail",
        readme_what="the sell module and what it requires — stock, maintenance, compliance, the books, people, documents, notifications, records, workflow and the offline runtime",
    ),
    "crm": dict(
        Name="CRM", product="the CRM", subject="the CRM module", domain="crm.corelith.co.zw",
        description="The CRM host: the sales product, composed from the CRM module, stock, the books, people, documents, notifications, records and the offline runtime on the kernel and the shell.",
        modules=["workflow", "notifications", "offline", "records", "documents", "books", "people", "stock", "crm"],
        compose=["platform", "shell", "crm", "stock", "books", "documents", "notifications", "people", "records", "offline"],
        primary="crm",
        readme_what="the CRM module and what it requires — stock, the books, people, documents, notifications, records, workflow and the offline runtime",
    ),
    "people": dict(
        Name="People", product="the workforce", subject="the people module", domain="people.corelith.co.zw",
        description="The People host: the HR and payroll product, composed from the people module, compliance, the books, documents, notifications, records and the offline runtime on the kernel and the shell.",
        modules=["workflow", "notifications", "offline", "records", "documents", "books", "people", "compliance"],
        compose=["platform", "shell", "people", "compliance", "books", "documents", "notifications", "records", "offline"],
        primary="people",
        readme_what="the people module and what it requires — compliance, the books, documents, notifications, records, workflow and the offline runtime",
    ),
}

args = sys.argv[1:]
HOST_ID = args[0]; H = HOSTS[HOST_ID]
OUT = args[args.index("--out") + 1] if "--out" in args else f"{ROOT}/apps/{HOST_ID}"
MODULES = H["modules"]; has = lambda m: m in MODULES
Name = H["Name"]
PACKAGES = ["@corelithzw/db", "@corelithzw/ui", "@corelithzw/platform", "@corelithzw/shell"] + [f"@corelithzw/module-{m}" for m in MODULES]

def read(p): return open(p).read()
def write(p, s): os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(s)
def copy(rel, dst_rel=None, transform=None):
    s = read(f"{LEG}/{rel}"); s = transform(s) if transform else s
    write(f"{OUT}/{dst_rel or rel}", s)
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
def drop(s, pattern, where, flags=0):
    s2 = re.sub(pattern, "", s, flags=flags); assert s2 != s, f"{where}: nothing matched"; return s2

# --- package.json: the legacy app's scripts and versions, this host's dependencies
legacy = json.load(open(f"{LEG}/package.json"))
KEEP_DEPS = set(PACKAGES) | {"@corelithzw/react", "@rtcamp/frappe-ui-react", "@tanstack/react-query", "@vercel/analytics", "dotenv", "next", "next-auth",
                             "react", "react-dom", "@sparticuz/chromium", "puppeteer-core", "@phosphor-icons/react"}
KEEP_DEV = {"@corelithzw/config", "@svgr/webpack", "@tailwindcss/postcss", "@types/node", "@types/react", "@types/react-dom",
            "eslint", "eslint-config-next", "tailwindcss", "tw-animate-css", "typescript", "vitest"}
pkg = {"name": f"@corelithzw/{HOST_ID}", "version": "0.1.0", "private": True, "description": H["description"],
       "scripts": {k: legacy["scripts"][k] for k in ("dev", "build", "start", "lint", "typecheck", "test", "test:watch")},
       "dependencies": dict(sorted({**{n: v for n, v in legacy["dependencies"].items() if n in KEEP_DEPS}, **{n: "workspace:*" for n in PACKAGES if n not in legacy["dependencies"]}}.items())),
       "devDependencies": dict(sorted((k, v) for k, v in legacy["devDependencies"].items() if k in KEEP_DEV))}
write(f"{OUT}/package.json", json.dumps(pkg, indent=2) + "\n")

# --- config files
for rel in ("tsconfig.json", "postcss.config.mjs", "vitest.config.ts", "types/next-auth.d.ts", "instrumentation.ts"): copy(rel)
if os.path.exists(f"{LEG}/next-env.d.ts"): copy("next-env.d.ts")
def next_config(s):
    s = re.sub(r'  transpilePackages: \[[^\]]*\],', "  transpilePackages: " + json.dumps(PACKAGES) + ",", s, count=1)
    a = s.index("  // Legacy Gold route redirects"); b = s.index("export default nextConfig;")
    s = s[:a] + "};\n\n" + s[b:]
    return s.replace("// This app is one workspace package.", f"// The {Name} host is one workspace package.")
copy("next.config.ts", transform=next_config)
def eslint(s):
    a = s.index("  {\n    // The type scale has a floor."); b = s.index("]);\n\nexport default eslintConfig;")
    rules = re.search(r'    rules: \{\n(?:.*\n)*?    \},\n', s[a:b]).group(0)
    block = ("  {\n    // The type scale has a floor: nothing under `text-sm`. This host's own\n"
             "    // components are the surfaces that have been brought up to it; the composed\n"
             "    // trees are the modules' and are linted in their packages.\n"
             '    files: ["components/**/*.tsx"],\n' + rules + "  },\n")
    return s[:a] + block + s[b:]
copy("eslint.config.mjs", transform=eslint)
copy("vitest.setup.ts", transform=lambda s: s.replace("// Load this app's .env", "// Load this host's .env"))

# --- the app tree's own files
for rel in ("app/globals.css", "app/themes/corelith-bridge.css", "app/themes/corelith-missing.css", "app/styles/components.css", "app/styles/design-system.css", "app/styles/tokens.css", "app/manifest.ts", "app/layout.tsx"):
    copy(rel)
write(f"{OUT}/app/page.tsx", f'''import {{ redirect }} from "next/navigation";

import {{ getCurrentAuthSession }} from "@corelithzw/platform/auth-core/session";
import {{ getComputedWorkspaceHomeHref }} from "@/lib/workspaces";

/**
 * The site root of a {Name} host is the workspace: a signed-in person lands
 * on their home, a signed-out visitor at sign-in. The product's public site is
 * its own project on the bare domain; this host serves {"the schools" if HOST_ID == "campus" else "the tenants"}.
 */
export default async function RootPage() {{
  const session = await getCurrentAuthSession();
  if (session?.user) {{
    redirect(
      getComputedWorkspaceHomeHref({{
        role: session.user.role,
        enabledFeatures: session.user.enabledFeatures,
        workspaceProfile: session.user.workspaceProfile,
      }}),
    );
  }}
  redirect("/login");
}}
''')
write(f"{OUT}/app/robots.ts", '''import type { MetadataRoute } from "next";

/** A workspace host: nothing on it is for a crawler. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
''')
for rel in ("public/icon-192.png", "public/icon-192.svg", "public/icon-512.png", "public/icon-512.svg", "public/manifest.json", "public/sw.js",
            "public/bold.37baf660.woff2", "public/medium.501e532c.woff2", "public/regular.4b554656.woff2"):
    os.makedirs(os.path.dirname(f"{OUT}/{rel}"), exist_ok=True); shutil.copy(f"{LEG}/{rel}", f"{OUT}/{rel}")

# --- providers, the app shell, the command bar
copy("components/providers/app-providers.tsx")
PORTALS = (["student", "parent", "teacher"] if has("campus") else []) + (["pos"] if has("sell") else [])
def app_shell(s):
    if not has("crm"):
        s = edit(s, 'import { CrmMembers } from "@corelithzw/module-crm/components/crm-members";\nimport { SidebarCrmCollections } from "@corelithzw/module-crm/components/sidebar-crm-collections";\n', "", where="app-shell crm imports")
        a = s.index("  // The CRM is the one module that is genuinely a shared book"); b = s.index("  const isAuthRoute = ")
        s = s[:a] + s[b:]
        s = edit(s, " collections={<SidebarCrmCollections />}", "", where="app-shell sidebar")
        s = edit(s, '            members={showMembers ? <CrmMembers className="mr-1" /> : null}\n', "", where="app-shell members")
    if not has("stock"):
        s = edit(s, 'import { fetchStockLocations } from "@corelithzw/module-stock/api-client";\nimport { canAccessCapabilityWithToken, hasTokenFeature } from "@corelithzw/platform/gating/token-check";\n',
                 'import { canAccessCapabilityWithToken } from "@corelithzw/platform/gating/token-check";\n', where="app-shell stock import")
        s = edit(s, 'import { useQuery } from "@tanstack/react-query";\n', "", where="app-shell useQuery")
        a = s.index("  // Which stock surfaces are worth offering"); b = s.index("  const showNotificationCenter = ")
        s = s[:a] + "  const resolveSidebarModel = React.useCallback((args: SidebarModelArgs) => getWorkspaceSidebarModel(args), []);\n" + s[b:]
    a = s.index("  const isPortalRoute =\n"); b = s.index("  const isAdminRoute = ")
    portal = '  const isPortalRoute =\n    pathname.startsWith("/portal/")' + "".join(f' ||\n    hostPortalPath === "/portal/{p}"' for p in PORTALS) + ";\n"
    s = s[:a] + portal + s[b:]
    for m in ("crm", "stock"):
        if not has(m): assert f"module-{m}" not in s, f"app shell still names {m}"
    return s
copy("components/layout/app-shell.tsx", transform=app_shell)
copy("components/layout/command-bar/global-command-bar.tsx")
copy("components/layout/command-bar/command-previews.tsx")

# --- this host's data: navigation, management, the workspace catalogue, offline, auth
OWNER_OF_REPORT = {"/reports": None, "/reports/audit-trails": None, "/reports/shift": "gold", "/reports/plant": "gold", "/reports/gold-chain": "gold", "/reports/gold-receipts": "gold",
                   "/reports/downtime": "gold", "/reports/attendance": "people", "/reports/stores-movements": "stock", "/reports/fuel-ledger": "stock",
                   "/reports/maintenance-work-orders": "maintenance", "/reports/maintenance-equipment": "maintenance", "/reports/compliance-incidents": "compliance"}
SECTION_OWNER = {"overview": True, "daily": "gold", "reporting": True, "people": "people", "payroll": "people", "maintenance": "maintenance", "stores": "stock",
                 "schools": "campus", "retail": "sell", "retail-customers": "sell", "gold": "gold", "crm": "crm", "accounting": "books", "settings": True, "templates": "documents"}
def keeps(owner): return owner is True or (owner is not None and has(owner))
def drop_items(sec, hrefs):
    for href in hrefs:
        sec = re.sub(r'      \{ href: "' + re.escape(href) + r'",[^\n]*\},\n', "", sec)
        sec = re.sub(r'      \{\n        href: "' + re.escape(href) + r'",\n(?:        .*\n)*?      \},\n', "", sec)
        assert f'href: "{href}"' not in sec, f"navigation still links {href}"
    return sec
def navigation(s):
    sections = re.split(r'(?=\n  \{\n    id: ")', s)
    head = sections[0]; out = []; carried = ""
    for sec in sections[1:]:
        sid = re.match(r'\n  \{\n    id: "([a-z-]+)"', sec).group(1)
        if not keeps(SECTION_OWNER[sid]):
            tail = re.search(r'((?:  //.*\n)+)$', sec + "\n"); carried = tail.group(1).rstrip("\n") if tail else ""
            continue
        if carried: sec = "\n" + carried + sec; carried = ""
        if sid == "reporting": sec = drop_items(sec, [h for h, o in OWNER_OF_REPORT.items() if not keeps(o)])
        if sid == "settings": sec = drop_items(sec, ["/dashboard"] + ([] if has("compliance") else ["/compliance"]))
        out.append(sec)
    s = head + "".join(out)
    s = s.replace("// Who may reach People and Payroll at all. Mirrored as a Set in `proxy.ts`,\n// which checks it on the route prefix before the page renders.",
                  "// Who may reach People and Payroll at all; the proxy checks it on the prefix\n// from the people module's manifest.")
    return prune_icon_imports(s)
copy("lib/navigation.ts", transform=navigation)
MANAGEMENT_OWNER = {"sections": "gold", "downtime-codes": "gold", "gold-expense-types": "gold", "scrap-materials": None, "scrap-sellers": None, "job-grades": "people",
                    "schools-years": "campus", "schools-classes": "campus", "schools-subjects": "campus", "schools-school-day": "campus", "schools-grading": "campus", "schools-identity": "campus"}
def management_nav(s):
    for iid, owner in MANAGEMENT_OWNER.items():
        if keeps(owner): continue
        s2 = re.sub(r'    \{\n      id: "' + iid + r'",\n(?:      .*\n)*?    \},\n', "", s)
        s2 = re.sub(r'    \{ id: "' + iid + r'",[^\n]*\},\n', "", s2)
        assert s2 != s, f"management nav: no item {iid}"; s = s2
    if not has("compliance"):
        s = drop(s, r'  \{\n    id: "compliance",\n(?:    .*\n)*?  \},\n', "management module item compliance")
        s = drop(s, r'  compliance: \[\n(?:    .*\n)*?  \],\n', "management compliance area")
        s = edit(s, "export const areaNavItems: Record<ManagementArea, ManagementNavItem[]> = {\n", "export const areaNavItems: Record<ManagementArea, ManagementNavItem[]> = {\n  // No compliance module on this host: the area has nothing to list.\n  compliance: [],\n", where="management areas")
    if has("campus"):
        pass
    else:
        # the comment that introduced the school's ladder went with its items
        s = re.sub(r'\n    // A school\'s academic ladder(?:.*\n)*?    // data, so it lives with the rest of the company\'s master data\.\n', "", s)
    return prune_icon_imports(s)
copy("lib/settings/management-nav.ts", transform=management_nav)

CATALOGUE_OWNER = {"gold": "gold", "schools": "campus", "retail": "sell", "crm": "crm", "people": "people", "payroll": "people", "stores": "stock", "maintenance": "maintenance",
                   "reporting": True, "accounting": "books", "management": True}
LEGACY_ORDER = ["gold", "schools", "retail", "crm", "people", "payroll", "stores", "maintenance", "accounting", "management", "reporting"]
PROFILE_OWNER = {"GOLD_MINE": "gold", "SCHOOLS": "campus", "RETAIL": "sell", "PAYROLL": "people"}
PROFILE_ICON = {"GOLD_MINE": "Gem", "SCHOOLS": "MedusaAcademicCapIcon", "RETAIL": "MedusaBuildingStorefrontIcon", "PAYROLL": "Payments"}
OTHERS = {"gold": "the mine", "campus": "the school", "sell": "the shop"}
def workspaces(s):
    for mod, owner in CATALOGUE_OWNER.items():
        if keeps(owner): continue
        s2 = re.sub(r'  ' + mod + r': createSectionModule\(\{\n(?:    .*\n)*?  \}\),\n', "", s)
        s2 = re.sub(r'  ' + mod + r': \{\n    id: "' + mod + r'",\n(?:(?:    .*|)\n)*?  \},\n', "", s2)
        assert s2 != s, f"catalogue: no module {mod}"; s = s2
    for prof, owner in PROFILE_OWNER.items():
        if keeps(owner): continue
        s = drop(s, r'  ' + prof + r': \{\n(?:(?:    .*|)\n)*?  \},\n', f"recipe {prof}")
        s = edit(s, f'  {prof}: "{CATALOGUE_OWNER_BY_PROFILE[prof]}",\n', "", where=f"owner {prof}")
        s = edit(s, f"  {prof}: {PROFILE_ICON[prof]},\n", "", where=f"icon {prof}")
    if not has("sell"):
        s = edit(s, 'import { canAccessPosPortal } from "@corelithzw/module-sell/pos-host";\n', "", where="pos import")
        s2 = re.sub(r'\n/\*\*\n \* Whether a stock transfer is a thing this workspace can actually do\.(?:.*\n)*?^}\n', "\n", s, flags=re.M); assert s2 != s, "stock reclassify helper"; s = s2
        s = drop(s, r'  // Retail surfaces on any retail feature or the till, not on one key\.\n  moduleGates: \{\n(?:    .*\n)*?  \},\n', "retail gate")
    if has("crm") and not has("sell"):
        s = edit(s, '''    /**
     * Two sections feed this module: the CRM proper and retail's customer
     * ledger. They used to share the id "crm" and rely on gating to leave
     * exactly one standing — the ledger surfaced only when `crm.core` was off
     * and the CRM section had already been filtered away. That worked and read
     * as a bug, so the ids are distinct now and the module names both.
     */
    getItems(context) {
      return [
        ...(context.navSectionById.get("crm")?.items ?? []),
        ...(context.navSectionById.get("retail-customers")?.items ?? []),
      ];
    },''', '''    // One section feeds this module on this host: the CRM proper. On the
    // enterprise host the module also lists the shop's customer ledger.
    getItems(context) {
      return context.navSectionById.get("crm")?.items ?? [];
    },''', where="crm module without the retail ledger")
    order = [m for m in LEGACY_ORDER if keeps(CATALOGUE_OWNER[m])]
    s = re.sub(r'const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId\[\] = \[\n(?:  .*\n)*?\];',
               "const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId[] = [\n" + "".join(f'  "{m}",\n' for m in order) + "];", s)
    s = s.replace(" * This host's workspace catalogue:", f" * The {Name} host's workspace catalogue:")
    a = s.index("export function getWorkspaceProfileForTemplate"); b = s.index("export function getWorkspaceHomeHref")
    rules = ""
    if has("gold"): rules += '  if (normalized.includes("GOLD")) return "GOLD_MINE";\n'
    if has("campus"): rules += '  if (normalized.includes("SCHOOL")) return "SCHOOLS";\n'
    if has("sell"): rules += '  if (normalized.includes("THRIFT") || normalized.includes("RETAIL")) return "RETAIL";\n'
    if has("people"): rules += '  if (normalized.includes("PAYROLL") || normalized.includes("BUREAU")) return "PAYROLL";\n'
    others = ", ".join(OTHERS[m] for m in ("gold", "campus", "sell") if not has(m))
    s = s[:a] + f'''export function getWorkspaceProfileForTemplate(code: string | null | undefined): WorkspaceProfile | null {{
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {{
    return null;
  }}

{rules}{textwrap.fill(f"Every other template this platform has issued — {others}, the retired ones — has no workspace of its own on this host: a tenant on one of those codes gets the general workspace here rather than a null profile.", width=82, initial_indent="  // ", subsequent_indent="  // ")}
  return "GENERAL";
}}

''' + s[b:]
    for mod, owner in CATALOGUE_OWNER.items():
        if not keeps(owner): assert not re.search(r'\b' + mod + r'\b', s.replace("// Retired profiles", "")), f"catalogue still names {mod}"
    return prune_icon_imports(s)
CATALOGUE_OWNER_BY_PROFILE = {"GOLD_MINE": "gold", "SCHOOLS": "schools", "RETAIL": "retail", "PAYROLL": "payroll"}
copy("lib/workspaces.ts", transform=workspaces)
copy("lib/auth.ts")
copy("lib/host/manifests.test.ts", transform=lambda s: s.replace('toContain("crm")', f'toContain("{H["primary"]}")'))
def offline_modules(s):
    if not has("sell"):
        a = s.index('  {\n    moduleId: "retail-pos",'); b = s.index("];\n", a); s = s[:a] + s[b:]
        for name in ("retailPreloadQueries", "retailMutationAdapters", "syncRetailCustomer", "syncRetailSale", "normalizeLegacyDocumentNumber"):
            s = re.sub(r'\n(?:/\*\*(?:.*\n)*?\*/\n)?(?:async )?(?:function|const) ' + name + r'\b.*?\n(?:(?!\n(?:async )?(?:function|const|export) ).*\n)*', "\n", s, count=1)
        s = re.sub(r'^import \{[^}]*\} from "@corelithzw/module-offline/entity-store";\n', "", s, flags=re.M)
        s = re.sub(r'^import \{ asErrorMessage, isLikelyNetworkFailure \} from "@corelithzw/module-offline/module-registry";\n', "", s, flags=re.M)
        s = re.sub(r'^import \{ fetchJson \} from "@corelithzw/platform/api-client";\n', "", s, flags=re.M)
        assert "retail" not in s.lower().replace("retailer", ""), "offline modules still name the till"
    return prune_named_imports(s, "@corelithzw/module-offline/types")
copy("lib/host/offline-modules.ts", transform=offline_modules)
def offline_workflows(s):
    if not has("sell"):
        a = s.index("  /**\n   * The till."); b = s.index("];\n", a); s = s[:a] + s[b:]
        s = drop(s, r'/\*\*\n \* The POS portal,(?:.*\n)*?\];\n\n', "pos routes")
        assert "RETAIL_POS_ROUTES" not in s
    if not has("gold"):
        s = edit(s, '  "/gold/settlement/approvals":\n    "Settlement approvals need tighter server coordination and are excluded.",\n', "", where="gold reason")
        s = edit(s, '    excludedRoutes: ["/gold/settlement/approvals"],\n', "", where="gold excluded", count=s.count('    excludedRoutes: ["/gold/settlement/approvals"],\n'))
        assert "gold" not in s
    if "OfflineMutationPolicy" not in s.split("\n", 8)[-1]:
        s = re.sub(r'^import type \{ OfflineMutationPolicy, OfflineWorkflowCatalogEntry \} from', 'import type { OfflineWorkflowCatalogEntry } from', s, flags=re.M)
    return s
copy("lib/host/offline-workflows.ts", transform=offline_workflows)
copy("modules.client.ts")

# --- composition: manifests, modules, the proxy
MANIFEST_ALIAS = {"campus": "schools", "sell": "retail"}
alias = lambda m: MANIFEST_ALIAS.get(m, m)
write(f"{OUT}/manifests.ts", f'''/**
 * What the {Name} host composes.
 *
 * The manifests of the modules this host runs, handed to the kernel's
 * registry. Data only — nothing here reaches a database — so the file is
 * imported wherever the registries are read: at boot on the server
 * (`modules.ts`), by the providers in the browser (`app-providers.tsx`), and
 * by the proxy on the edge. `lib/host/manifests.test.ts` keeps it that way.
 */
import {{ registerModules, unmetModuleRequirements }} from "@corelithzw/platform/manifest";
import {{ registerManagementNavigation }} from "@corelithzw/shell/management";
import {{ registerNavigationSections }} from "@corelithzw/shell/navigation";
import {{ navSections }} from "@/lib/navigation";
import {{ areaLabels, areaNavItems, managementModuleItems }} from "@/lib/settings/management-nav";
''' + "".join(f'import {{ manifest as {alias(m)} }} from "@corelithzw/module-{m}/manifest";\n' for m in MODULES) + f'''
registerModules([{", ".join(alias(m) for m in MODULES)}]);

// The navigation model is data the host owns; the chrome reads it here.
registerNavigationSections(navSections);
registerManagementNavigation({{ modules: managementModuleItems, areas: areaNavItems, labels: areaLabels }});

const unmet = unmetModuleRequirements();
if (unmet.length > 0) {{
  throw new Error(
    `This host composes modules that require others it does not compose: ${{unmet
      .map((entry) => `${{entry.module}} requires ${{entry.requires}}`)
      .join("; ")}}.`,
  );
}}
''')

imports = []
if has("campus"): imports.append('import { onFiscalBacklog, registerFiscalDrainIssuer, registerFiscalDrainSweep } from "@corelithzw/module-books/fiscal-drain";')
elif has("compliance"): imports.append('import { onFiscalBacklog } from "@corelithzw/module-books/fiscal-drain";')
if has("crm"): imports.append('import { onSalesInvoiceCreated, onSalesReceiptCreated } from "@corelithzw/module-books/sales-hooks";')
imports.append('import { registerDocumentSource } from "@corelithzw/module-documents/source-registry";')
imports.append('import { registerSearchArm } from "@corelithzw/module-records/search";')
if has("crm") or has("campus"): imports.append('import { registerRecordSubjectGuard } from "@corelithzw/module-records/subject-guard";')
imports.append('import { onApprovalAction } from "@corelithzw/module-workflow/approvals";')
blocks = [f'''/**
 * How the {Name} host is wired: the code its modules hook into each other
 * with, and how it authenticates. What it composes is `manifests.ts`,
 * imported first. Server only; imported once at boot from
 * `instrumentation.ts`, and by any test that reads a registry filled here.
 */
import {{ registerAuthOptions }} from "@corelithzw/platform/auth-core/auth-options";
import "./manifests";
import "./modules.client";
''' + "\n".join(imports) + '''

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

// After an approval action: the people the entity concerns are told. The
// people module's entities are the only approvable ones this host runs.
onApprovalAction(async (tx, event) => {
  const { emitPeopleApprovalNotification } = await import("@corelithzw/module-people/approval-notifications");
  await emitPeopleApprovalNotification(tx, event);
});
''']
if has("campus"):
    blocks.append('''
// Who may file against a record: the school decides for its record types.
registerRecordSubjectGuard("schools", async (session, action) => (await import("@corelithzw/module-campus/record-guard")).schoolRecordGuard(session, action));
''')
if has("crm"):
    blocks.append('''
// Who may file against a record: the CRM decides for its record types.
registerRecordSubjectGuard("crm", async (session, action) => (await import("@corelithzw/module-crm/record-guard")).crmRecordGuard(session, action));
''')
arms_note = {"campus": "the school's records and the staff directory", "sell": "the shop's records and the staff directory", "crm": "the CRM's records and the staff directory", "people": "the staff directory"}[HOST_ID]
arms = f"\n// The search box's arms: {arms_note}.\n"
if has("crm"):
    arms += '''registerSearchArm({ id: "crm", run: async (db, input) => (await import("@corelithzw/module-crm/search")).searchCrm(db, input) });
'''
if has("campus"):
    arms += '''registerSearchArm({
  id: "schools",
  run: async (db, input) => {
    const { searchSchools } = await import("@corelithzw/module-campus/search");
    return searchSchools(db, { ...input, types: input.types as Parameters<typeof searchSchools>[1]["types"] });
  },
});
'''
arms += '''registerSearchArm({
  id: "people",
  run: async (db, input) => {
    const { searchPeople } = await import("@corelithzw/module-people/people/search");
    return searchPeople(db, { ...input, types: input.types as Parameters<typeof searchPeople>[1]["types"] });
  },
});
'''
if has("sell"):
    arms += '''registerSearchArm({
  id: "retail",
  run: async (db, input) => {
    const { searchRetail } = await import("@corelithzw/module-sell/search");
    return searchRetail(db, { ...input, types: input.types as Parameters<typeof searchRetail>[1]["types"] });
  },
});
'''
blocks.append(arms)
sources_note = {"campus": "the school's paper, the payslip, the books' sales documents", "sell": "the payslip, the books' sales documents", "crm": "the payslip, the books' sales documents", "people": "the payslip, the books' sales documents"}[HOST_ID]
sources = f"\n// Where each printable document's content comes from, by the module that owns\n// the records: {sources_note}.\n"
if has("campus"):
    sources += '''registerDocumentSource({
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
'''
sources += '''registerDocumentSource({
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
'''
blocks.append(sources)
if has("crm"):
    blocks.append('''
// The books announce a sales document; the CRM, downstream of the money,
// keeps its quote and its deal in step.
onSalesInvoiceCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingInvoiceCreated(event));
onSalesReceiptCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingReceiptCreated(event));
''')
if has("campus"):
    blocks.append('''
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
''')
elif has("compliance"):
    blocks.append('''
// A tenant whose fiscal drain is stuck becomes a compliance incident.
''')
if has("compliance"):
    blocks.append('''onFiscalBacklog(async (event) => {
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
write(f"{OUT}/modules.ts", "".join(blocks))

matcher_extra = ([] if not has("gold") else ['    "/api/gold/:path*",\n']) + (['    "/api/payroll/:path*",\n'] if has("people") else []) + (['    "/api/compliance/:path*",\n'] if has("compliance") else [])
matcher_note = {"campus": "the\n * payroll and compliance APIs it names", "sell": "the\n * payroll and compliance APIs it names", "crm": "the\n * payroll API it names", "people": "the\n * payroll and compliance APIs it names"}[HOST_ID]
verb = "authenticate" if HOST_ID != "crm" else "authenticates"
write(f"{OUT}/proxy.ts", f'''/**
 * The {Name} host's edge proxy: the kernel's, over the manifests this host
 * registers. The matcher is here because Next reads it statically; {matcher_note} {verb} with a bare session and
 * need the proxy's gates.
 */
// The route registry reads the manifests, and the edge runtime has no boot hook.
import "@/manifests";
import {{ createProxy }} from "@corelithzw/platform/proxy";

export default createProxy();

export const config = {{
  matcher: [
    "/((?!api/auth|api|_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|js|json|webmanifest|txt|xml)).*)",
''' + "".join(matcher_extra) + '''  ],
};
''')

# --- the search box's route: host composition, with the arms this host runs
arm_imports = ""
if has("campus"):
    arm_imports += '''import { canSchoolRoleDo } from "@corelithzw/module-campus/permissions";
import {
  SCHOOL_SEARCH_FEATURES,
  SCHOOL_SEARCH_RESOURCES,
  SCHOOL_SEARCH_TYPES,
  type SchoolSearchType,
} from "@corelithzw/module-campus/search";
'''
if has("sell"):
    arm_imports += '''import {
  RETAIL_SEARCH_FEATURES,
  RETAIL_SEARCH_TYPES,
  type RetailSearchType,
} from "@corelithzw/module-sell/search";
'''
arm_code = ""
if has("campus"):
    arm_code += '''    const schools: SchoolSearchType[] = SCHOOL_SEARCH_TYPES.filter(
      (type) =>
        enabled(SCHOOL_SEARCH_FEATURES[type]) &&
        canSchoolRoleDo(role, SCHOOL_SEARCH_RESOURCES[type], "view"),
    );
'''
arm_code += '''    // `hrPermissionDenial` returns a message when refused and null when
    // allowed, the inverse of `canSchoolRoleDo` — hence the `=== null`.
    const people: PeopleSearchType[] = PEOPLE_SEARCH_TYPES.filter(
      (type) =>
        enabled(PEOPLE_SEARCH_FEATURES[type]) &&
        hrPermissionDenial(session, PEOPLE_SEARCH_RESOURCES[type], "view") === null,
    );
''' if has("campus") else '''    // `hrPermissionDenial` returns a message when refused and null when
    // allowed — hence the `=== null`.
    const people: PeopleSearchType[] = PEOPLE_SEARCH_TYPES.filter(
      (type) =>
        enabled(PEOPLE_SEARCH_FEATURES[type]) &&
        hrPermissionDenial(session, PEOPLE_SEARCH_RESOURCES[type], "view") === null,
    );
'''
if has("sell"):
    arm_code += '''    // The shop's arm resolves on the feature axis only: the sell module ships
    // no role-resource matrix of its own, and inventing a search-only one would
    // be a rule enforced in one place and nowhere else.
    const retail: RetailSearchType[] = RETAIL_SEARCH_TYPES.filter((type) =>
      enabled(RETAIL_SEARCH_FEATURES[type]),
    );
'''
scope = ", ".join((["crm: enabled(\"crm.core\")"] if has("crm") else []) + (["schools"] if has("campus") else []) + ["people"] + (["retail"] if has("sell") else []))
role_line = "    const role = session.user.role;\n" if has("campus") else ""
write(f"{OUT}/app/api/v2/records/search/route.ts", '''import { NextRequest, NextResponse } from "next/server";

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
''' + arm_imports + '''
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

''' + role_line + arm_code + f'''
    const scope: SearchScope = {{ {scope} }};

    const results = await searchRecords(prisma, {{
      companyId,
      query,
      limitPerType: Number.isFinite(limitPerType) ? Math.min(Math.max(limitPerType, 1), 20) : 5,
      scope,
    }});

    return successResponse({{
      query,
      groups: groupSearchResults(results),
      total: results.length,
    }});
  }} catch (error) {{
    console.error("[API] GET /api/v2/records/search error:", error);
    return errorResponse("Search failed");
  }}
}}
''')

readme_p1 = textwrap.fill(f"The {Name} host: {'the school' if HOST_ID == 'campus' else H['product']} product on its own Vercel project and host (`*.{H['domain']}`), composed from {H['readme_what']} — on the kernel and the shell.", width=78)
readme_last = textwrap.fill(f"`pnpm compose apps/{HOST_ID} {' '.join(H['compose'])}` writes one re-export per route and page.", width=78)
write(f"{OUT}/README.md", f'''# @corelithzw/{HOST_ID}

{readme_p1}

What is written here by hand is this host's own: its module list
(`manifests.ts`), its wiring (`modules.ts`, `modules.client.ts`), its
navigation, management areas and workspace catalogue (`lib/`), its offline
scope (`lib/host/`), the app shell it renders (`components/`), its styles,
root layout and root page, and the search box's route (`app/api/v2/records/
search`), whose arms are the modules this host runs. Everything else under
`app/` is composed:
{readme_last}
''')
print(f"scaffolded {OUT} for {HOST_ID}")
