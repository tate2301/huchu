#!/usr/bin/env python3
"""3.1c-prep: the sidebar model builder to the shell (the host keeps its catalogue); the quick actions to the shell;
the accounting document sources to books. Steps: model actions sources check (default: all)."""
import os, re, json, subprocess, sys
ROOT = "/home/user/huchu"; APP = f"{ROOT}/apps/legacy"; PK = f"{ROOT}/packages"; SH = f"{PK}/shell"; MOD = f"{PK}/modules"
S = "/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad"
steps = sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def read(p): return open(p).read()
def write(p, s): os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(s)
def edit(p, old, new, count=1):
    s = read(p); n = s.count(old)
    assert n == count, f"{os.path.relpath(p, ROOT)}: expected {count} of {old[:70]!r}, found {n}"
    write(p, s.replace(old, new))
def walk(base, exts=(".ts", ".tsx")):
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in ("node_modules", ".next", ".turbo")]
        for f in fn:
            if f.endswith(exts): yield os.path.join(dp, f)
def ranges(file, names):
    out = subprocess.run(["node", f"{S}/tsslice_any.mjs", file, ",".join(names)], capture_output=True, text=True, check=True).stdout
    found = {b["name"]: b for b in json.loads(out)}
    missing = [n for n in names if n not in found]
    assert not missing, f"not found in {file}: {missing}"
    return found
def blocks(file, names):
    src = read(file); f = ranges(file, names)
    return {n: src[f[n]["start"]:f[n]["end"]].strip("\n") for n in names}
def deps(file):
    return {d["name"]: d for d in json.loads(subprocess.run(["node", f"{S}/tsdeps.mjs", file], capture_output=True, text=True, check=True).stdout)}

if want("model"):
    sh(f'cp "{S}/31c/workspace-model.ts" "{SH}/workspace-model.ts"')
    ws = f"{APP}/lib/workspaces.ts"
    keep = ["canReclassifyStockBetweenLocations", "WORKSPACE_MODULES", "WORKSPACE_PROFILE_RECIPES", "getWorkspaceProfileForTemplate",
            "WORKSPACE_MODULE_ORDER", "CANONICAL_MODULE_IDS", "STRICT_WORKSPACE_MODULE_FEATURE_KEYS", "PROFILE_OWNER_MODULES",
            "WORKSPACE_PROFILE_ICONS", "SUPPORT_ITEMS"]
    b = blocks(ws, keep)
    # the accounting consolidation, as the catalogue's hook, from the builder's special case
    body = b["WORKSPACE_MODULES"]
    assert "createSectionModule({" in body and "canAccessPosPortal(context.role)" in body
    recipes = b["WORKSPACE_PROFILE_RECIPES"]
    old = "  RETAIL: {\n    label: \"Retail\",\n    preferredHomeHref: \"/retail\",\n"
    assert recipes.count(old) == 1
    recipes = recipes.replace(old, "  RETAIL: {\n    label: \"Retail\",\n    preferredHomeHref: \"/retail\",\n    // Only the curated sections, then the core modules under \"more\".\n    curatedOnly: true,\n")
    recipes = recipes.replace("const WORKSPACE_PROFILE_RECIPES: Partial<Record<WorkspaceProfile, WorkspaceProfileRecipe>> & {\n  GENERAL: WorkspaceProfileRecipe;\n} = {", "const WORKSPACE_PROFILE_RECIPES: WorkspaceCatalogue[\"recipes\"] = {")
    assert 'WorkspaceCatalogue["recipes"]' in recipes
    modules = body.replace("const WORKSPACE_MODULES: Record<WorkspaceModuleId, WorkspaceModuleDefinition> = {", "const WORKSPACE_MODULES: WorkspaceCatalogue[\"modules\"] = {")
    assert 'WorkspaceCatalogue["modules"]' in modules
    new = '''/**
 * This host's workspace catalogue: the modules it composes into the sidebar,
 * the order they surface in, the curated arrangement each workspace profile
 * shows first, the home each prefers, the quick actions. The builder that
 * gates, resolves the profile and assembles the sections is the shell's
 * (`buildWorkspaceSidebarModel`); this file is the data it works from, next
 * to the module list in `manifests.ts`.
 */
import { ACCOUNTING_OPERATIONS_SECTIONS, ACCOUNTING_TABS } from "@corelithzw/module-books/tab-config";
import { filterAccountingTabsByFeatures } from "@corelithzw/module-books/visibility";
import { canAccessPosPortal } from "@corelithzw/module-sell/pos-host";
import type { NavItem } from "@corelithzw/shell/navigation";
import { getVisibleManagementModuleItems } from "@corelithzw/shell/management";
import { getPrimaryQuickActions } from "@corelithzw/shell/primary-actions";
import type { WorkspaceNavSection, WorkspaceSectionGroup, WorkspaceSidebarModel } from "@corelithzw/shell/sidebar-model";
import {
  buildWorkspaceSidebarModel,
  createSectionModule,
  normalizeWorkspaceProfile,
  workspaceHomeHref,
  type WorkspaceCatalogue,
  type WorkspaceModelArgs,
} from "@corelithzw/shell/workspace-model";
import { WORKSPACE_PROFILES, type WorkspaceModuleId, type WorkspaceProfile } from "@corelithzw/platform/workspace-products";
import {
  Dashboard,
  Gem,
  FileText,
  MedusaAcademicCapIcon,
  MedusaBuildingStorefrontIcon,
  Payments,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";

export { WORKSPACE_PROFILES, normalizeWorkspaceProfile };
export type { WorkspaceModuleId, WorkspaceProfile, WorkspaceModelArgs };
export type { WorkspaceNavSection, WorkspaceSectionGroup, WorkspaceSidebarModel };

''' + b["CANONICAL_MODULE_IDS"] + "\n" + b["STRICT_WORKSPACE_MODULE_FEATURE_KEYS"] + "\n" + b["PROFILE_OWNER_MODULES"] + "\n" + b["WORKSPACE_PROFILE_ICONS"] + "\n" + b["WORKSPACE_MODULE_ORDER"] + "\n\n" + b["SUPPORT_ITEMS"] + "\n\n" + b["canReclassifyStockBetweenLocations"] + "\n\n" + modules + "\n\n" + recipes + "\n\n" + '''/**
 * The books list their entry points in one consolidated section: sub-tabs and
 * grouping live inside the /accounting shell, and the sidebar lists the doors.
 * Overview first; the banking section is not a sidebar entry point.
 */
function consolidateAccounting(
  moduleId: WorkspaceModuleId,
  moduleItems: NavItem[],
  workspaceGroup: WorkspaceSectionGroup,
  excludedHrefs: Set<string> | undefined,
): WorkspaceNavSection[] | null {
  if (moduleId !== "accounting") return null;
  const orderedHrefs = [
    ...ACCOUNTING_OPERATIONS_SECTIONS.overview,
    ...ACCOUNTING_OPERATIONS_SECTIONS.receivables,
    ...ACCOUNTING_OPERATIONS_SECTIONS.payables,
    ...ACCOUNTING_OPERATIONS_SECTIONS.reporting,
    ...ACCOUNTING_OPERATIONS_SECTIONS.master,
  ];
  const items: NavItem[] = [];
  for (const href of orderedHrefs) {
    if (excludedHrefs?.has(href)) continue;
    const item = moduleItems.find((candidate) => candidate.href === href);
    if (item) items.push(item);
  }
  if (items.length === 0) return [];
  return [{ id: "accounting-master", title: "Accounting Master", items, workspaceGroup }];
}

export const WORKSPACE_CATALOGUE: WorkspaceCatalogue = {
  modules: WORKSPACE_MODULES,
  moduleOrder: WORKSPACE_MODULE_ORDER,
  canonicalModuleIds: CANONICAL_MODULE_IDS,
  strictModuleFeatureKeys: STRICT_WORKSPACE_MODULE_FEATURE_KEYS,
  // Retail surfaces on any retail feature or the till, not on one key.
  moduleGates: {
    retail: (enabled) => Array.from(enabled).some((feature) => feature.startsWith("retail.") || feature === "portal.pos"),
  },
  recipes: WORKSPACE_PROFILE_RECIPES,
  profileOwnerModules: PROFILE_OWNER_MODULES,
  profileIcons: WORKSPACE_PROFILE_ICONS,
  consolidateModule: consolidateAccounting,
  quickActions: getPrimaryQuickActions,
  supportItems: SUPPORT_ITEMS,
};

''' + b["getWorkspaceProfileForTemplate"] + '''

export function getWorkspaceHomeHref(profile: string | null | undefined): string {
  return workspaceHomeHref(WORKSPACE_CATALOGUE, profile);
}

export function getComputedWorkspaceHomeHref(args: WorkspaceModelArgs): string {
  return getWorkspaceSidebarModel(args).homeHref;
}

export function getWorkspaceSidebarModel(args: WorkspaceModelArgs): WorkspaceSidebarModel {
  return buildWorkspaceSidebarModel(WORKSPACE_CATALOGUE, args);
}
'''
    # names the kept blocks reference that the new header must cover
    for must in ("WorkspaceModuleDefinition", "WorkspaceProfileRecipe"):
        if re.search(r'\b' + must + r'\b', new):
            new = new.replace("  type WorkspaceCatalogue,\n", f"  type WorkspaceCatalogue,\n  type {must},\n", 1)
    write(ws, new)
    print("legacy catalogue written; shell workspace-model in place")
    # the shell's index and README name the new file
    idx = f"{SH}/index.ts"
    if "workspace-model" not in read(idx):
        write(idx, read(idx).rstrip("\n") + '\nexport type { WorkspaceCatalogue, WorkspaceModelArgs, WorkspaceModuleDefinition, WorkspaceProfileRecipe } from "./workspace-model";\n')

if want("actions"):
    src = f"{APP}/lib/primary-actions.ts"; dst = f"{SH}/primary-actions.ts"
    if os.path.exists(src):
        sh(f'git mv "{src}" "{dst}"')
    s = read(dst)
    s = s.replace('import type { NavItem } from "@/lib/navigation";', 'import type { NavItem } from "./navigation";')
    assert '"@/' not in s
    s = '''/**
 * The quick-create actions a workspace offers, keyed by the vertical product a
 * tenant resolves to, so every workspace only ever offers actions native to
 * its own modules. Filtered by role and by the tenant's enabled features (via
 * the route registry), so an action never renders for a feature the tenant
 * lacks. Data: hrefs and icons; the shell names no module code.
 */
''' + s
    write(dst, s)
    for p in walk(APP):
        t = read(p)
        if '"@/lib/primary-actions"' in t:
            write(p, t.replace('"@/lib/primary-actions"', '"@corelithzw/shell/primary-actions"')); print("rewired", os.path.relpath(p, APP))
    print("quick actions in the shell")

if want("sources"):
    ld = f"{APP}/lib/host/document-sources.ts"
    d = deps(ld)
    accounting = ["resolveInvoice", "resolveQuotation", "resolveReceipt", "resolveCreditNote"]
    # what the accounting resolvers reach, transitively, among the file's own declarations
    need = set(); todo = list(accounting)
    while todo:
        n = todo.pop()
        if n in need: continue
        need.add(n); todo.extend(d[n]["refs"])
    others = [n for n in d if n not in need and n not in ("LEGACY_DOCUMENT_SOURCE_PREFIXES", "matchesLegacyDocumentSource", "LEGACY_DOCUMENT_FEATURES", "legacyDocumentSource")]
    also = set(); todo = list(others)
    while todo:
        n = todo.pop()
        if n in also: continue
        also.add(n); todo.extend(d[n]["refs"])
    shared = sorted(n for n in need if n in also)            # helpers both sides use: copied
    cut = [n for n in d if n in need and n not in also]      # accounting-only: moved
    order = [n for n in d if n in need]                      # file order
    b = blocks(ld, order)
    books = f"{MOD}/books/document-sources.ts"
    write(books, '''/**
 * The books' printable documents — a sales invoice, a quotation, a receipt, a
 * credit note — resolved into the universal payload the documents module
 * renders. A host registers this source (`registerDocumentSource` from its
 * `modules.ts`); the feature that opens each is `booksDocumentFeatureKeys`.
 */
import { prisma } from "@corelithzw/db/client";
import type { SourceResolution } from "@corelithzw/module-documents/source-registry";

''' + "\n\n".join(b[n] for n in order) + '''

export const BOOKS_DOCUMENT_SOURCE_PREFIX = "accounting.";

/** Sales documents open from the books or from the CRM; a tenant needs either. */
const BOOKS_DOCUMENT_FEATURES: Record<string, string[]> = {
  "accounting.sales.invoice": ["accounting.ar", "crm.documents"],
  "accounting.sales.quotation": ["accounting.ar", "crm.documents"],
  "accounting.sales.receipt": ["accounting.ar", "crm.documents"],
  "accounting.sales.credit-note": ["accounting.ar"],
};

export function booksDocumentFeatureKeys(sourceKey: string): string[] {
  return BOOKS_DOCUMENT_FEATURES[sourceKey] ?? [];
}

export async function resolveBooksDocument(input: {
  companyId: string;
  sourceKey: string;
  recordId?: string;
  filters?: Record<string, string>;
}): Promise<SourceResolution> {
  const { companyId } = input;
  switch (input.sourceKey) {
    case "accounting.sales.invoice":
      if (!input.recordId) throw new Error("recordId is required for invoice export");
      return resolveInvoice(companyId, input.recordId);
    case "accounting.sales.quotation":
      if (!input.recordId) throw new Error("recordId is required for quotation export");
      return resolveQuotation(companyId, input.recordId);
    case "accounting.sales.receipt":
      if (!input.recordId) throw new Error("recordId is required for receipt export");
      return resolveReceipt(companyId, input.recordId);
    case "accounting.sales.credit-note":
      if (!input.recordId) throw new Error("recordId is required for credit note export");
      return resolveCreditNote(companyId, input.recordId);
    default:
      throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
  }
}
''')
    # the legacy source loses the accounting cases, the moved helpers, and the accounting prefix and keys
    s = read(ld); r = ranges(ld, cut)
    for n in sorted(cut, key=lambda n: -r[n]["start"]):
        s = s[:r[n]["start"]] + s[r[n]["end"]:]
    s = re.sub(r'\n{3,}', "\n\n", s)
    for case in ("invoice", "quotation", "receipt", "credit-note"):
        m = re.search(r'      case "accounting\.sales\.' + case + r'":\n(?:        .*\n)+', s)
        assert m, case
        s = s[:m.start()] + s[m.end():]
    s = s.replace('export const LEGACY_DOCUMENT_SOURCE_PREFIXES = ["accounting.", "reports.", "dashboard."] as const;', 'export const LEGACY_DOCUMENT_SOURCE_PREFIXES = ["reports.", "dashboard."] as const;')
    for key in ("invoice", "quotation", "receipt", "credit-note"):
        s = re.sub(r'  "accounting\.sales\.' + key + r'": \[[^\]]*\],\n', "", s)
    s = s.replace(" * The document sources this host's modules have not taken with them yet: the\n * accounting documents, the mine's shift and plant reports, the attendance\n * report and the executive dashboard.",
                  " * The document sources this host's modules have not taken with them yet: the\n * mine's shift and plant reports, the attendance report and the executive\n * dashboard.")
    assert "accounting.sales" not in s and "resolveInvoice" not in s, "accounting left in the legacy source"
    write(ld, s)
    ms = f"{APP}/modules.ts"
    edit(ms, '''registerDocumentSource({
  id: "legacy",
  matches: (key) => ["accounting.", "reports.", "dashboard."].some((prefix) => key.startsWith(prefix)),''', '''registerDocumentSource({
  id: "books",
  matches: (key) => key.startsWith("accounting."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-books/document-sources")).booksDocumentFeatureKeys(key) }),
  resolve: async (input) => (await import("@corelithzw/module-books/document-sources")).resolveBooksDocument(input),
});
registerDocumentSource({
  id: "legacy",
  matches: (key) => ["reports.", "dashboard."].some((prefix) => key.startsWith(prefix)),''')
    print(f"books document sources: moved {cut}, shared helpers copied {shared}")

if want("check"):
    for p in (f"{SH}/workspace-model.ts", f"{SH}/primary-actions.ts", f"{MOD}/books/document-sources.ts"):
        t = read(p); assert '"@/' not in t and "@corelithzw/module-" not in t.replace("module-documents", "") or p.endswith("document-sources.ts"), p
    print("ok:", [os.path.relpath(p, ROOT) for p in (f"{SH}/workspace-model.ts", f"{SH}/primary-actions.ts", f"{MOD}/books/document-sources.ts") if os.path.exists(p)])
