"""Phase 2.3i (offline): the offline module — the runtime, outbox, sync engine and chrome. The module definitions and
workflow catalogue that name people and retail become a registry the host fills on the client and the server."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/offline"
SCRATCH="/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad"
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def edit(path, pairs):
    s=open(path).read()
    for old,new,count in pairs:
        n=s.count(old); assert n==count,(path,old[:70],n,count)
    for old,new,count in pairs: s=s.replace(old,new)
    open(path,"w").write(s)
def walk(base):
    for dp,dn,fn in os.walk(base):
        dn[:]=[d for d in dn if d not in ("node_modules",".next",".turbo")]
        for f in fn:
            if f.endswith((".ts",".tsx")): yield os.path.join(dp,f)
def move_tree(src, dst):
    for dp,dn,fn in os.walk(src):
        rel=os.path.relpath(dp, src); target=os.path.join(dst, rel) if rel!="." else dst
        os.makedirs(target, exist_ok=True)
        for f in fn: sh(f'git mv "{os.path.join(dp,f)}" "{os.path.join(target,f)}"')
    sh(f'rm -rf "{src}"')
steps=sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps
MAP=[("@/lib/offline/","@corelithzw/module-offline/"),("@/components/offline/","@corelithzw/module-offline/components/"),("@/components/offline","@corelithzw/module-offline/components"),
     ("@/components/providers/offline-provider","@corelithzw/module-offline/components/offline-provider"),("@/hooks/use-offline-connectivity","@corelithzw/module-offline/hooks/use-offline-connectivity"),
     ("@/components/layout/offline-status-button","@corelithzw/module-offline/components/offline-status-button"),("@/components/layout/offline-runtime-panel","@corelithzw/module-offline/components/offline-runtime-panel"),
     ("@/components/layout/offline-status-tone","@corelithzw/module-offline/components/offline-status-tone")]
def target(spec):
    for old,new in MAP:
        if old.endswith("/"):
            if spec.startswith(old): return new+spec[len(old):]
        elif spec==old: return new
    return None

if want("split"):
    # the definitions that name people and retail go to the host; the engine keeps a registry
    p=f"{APP}/lib/offline/module-registry.ts"; s=open(p).read()
    a=s.index("function isLikelyNetworkFailure("); b=s.index("function normalizeLegacyDocumentNumber(")
    c=s.index("export function getOfflineModule(")
    helpers=s[a:b]; definitions=s[b:c]; engine=s[c:]
    imports=s[:a]
    host='''/**
 * The offline modules this host composes: the workforce essentials and the
 * till. Each names its module's routes, queries and sync adapters, and moves
 * into that module when the manifests carry offline workflows; the runtime
 * they plug into is `@corelithzw/module-offline`.
 */
'''+imports.replace('import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "@/lib/offline/entity-store";\n','import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "@corelithzw/module-offline/entity-store";\n').replace('import { getOfflineWarmupModuleIds } from "@/lib/offline/workflow-catalog";\n','')
    host=re.sub(r'import \{\n[^}]*\} from "@/lib/offline/outbox";\n', '', host)
    host=host.replace('} from "@/lib/offline/types";', '} from "@corelithzw/module-offline/types";')
    host+=definitions.rstrip("\n")+"\n"
    open(f"{APP}/lib/host/offline-modules.ts","w").write(host)
    mod='''/**
 * Which offline modules exist, and how an outbox operation is synced.
 *
 * The definitions — which routes to warm, which queries to preload, how to
 * sync a held sale — belong to the modules that own the screens. The host
 * registers them on both sides (`modules.client.ts`); this file keeps the
 * registry and the engine and names no module.
 */
import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "./entity-store";
import { registry } from "@corelithzw/platform/registry";
import { getOfflineWarmupModuleIds } from "./workflow-catalog";
'''+re.search(r'import \{\n[^}]*\} from "@/lib/offline/outbox";\n', s).group(0).replace('"@/lib/offline/outbox"','"./outbox"')+re.search(r'import type \{\n[^}]*\} from "@/lib/offline/types";\n', s).group(0).replace('"@/lib/offline/types"','"./types"')+'''
const modules = registry<Map<string, OfflineModuleDefinition>>("offline.modules", () => new Map());

export function registerOfflineModules(definitions: readonly OfflineModuleDefinition[]): void {
  for (const definition of definitions) modules.set(definition.moduleId, definition);
}

export function registeredOfflineModules(): OfflineModuleDefinition[] {
  return [...modules.values()];
}

'''+helpers+engine.replace("OFFLINE_MODULES.find(", "registeredOfflineModules().find(").replace("OFFLINE_MODULES.filter(", "registeredOfflineModules().filter(")
    assert "OFFLINE_MODULES" not in mod, "engine still names the definitions"
    open(p,"w").write(mod)

    # the workflow catalogue: entries carry the features they need; the data goes to the host
    p=f"{APP}/lib/offline/workflow-catalog.ts"; s=open(p).read()
    a=s.index("const OFFLINE_EXCLUDED_ROUTE_REASONS"); b=s.index("function hasHrMinimalFeature(")
    data=s[a:b]
    data=data.replace('export const OFFLINE_WORKFLOW_CATALOG: OfflineWorkflowCatalogEntry[] = [', 'export const OFFLINE_WORKFLOW_CATALOG: OfflineWorkflowCatalogEntry[] = [')
    data=data.replace('    vertical: "HR",\n', '    vertical: "HR",\n    requiredFeatures: ["hr.employees", "hr.shift-groups", "hr.incidents", "hr.disciplinary-actions"],\n', 1)
    data=data.replace('    vertical: "RETAIL",\n', '    vertical: "RETAIL",\n    requiredFeatures: ["retail.pos"],\n', 1)
    assert data.count("requiredFeatures")==2, data.count("requiredFeatures")
    data=data.replace("const OFFLINE_EXCLUDED_ROUTE_REASONS", "export const OFFLINE_EXCLUDED_ROUTE_REASONS", 1)
    head=s[:a]
    people_import=re.search(r'import \{ PEOPLE_TABS \} from "[^"]+";\n', head).group(0)
    open(f"{APP}/lib/host/offline-workflows.ts","w").write('''/**
 * The offline workflows this host warms — the workforce essentials and the
 * till — and the routes it keeps online on purpose. Data the modules will
 * carry in their manifests; registered on both sides from `modules.client.ts`.
 */
'''+people_import+'import type { OfflineMutationPolicy, OfflineWorkflowCatalogEntry } from "@corelithzw/module-offline/types";\n\n'+data.rstrip("\n")+"\n")
    functions=s[b:]
    functions=functions[functions.index("export function resolveOfflineWorkflowCatalog("):]
    functions=functions.replace('''export function resolveOfflineWorkflowCatalog(enabledFeatures?: string[]) {
  const features = new Set(enabledFeatures ?? []);
  return OFFLINE_WORKFLOW_CATALOG.filter((entry) => {
    if (entry.vertical === "HR") {
      return hasHrMinimalFeature(features);
    }
    if (entry.vertical === "RETAIL") {
      return hasRetailPosFeature(features);
    }
    // Unknown verticals warm nothing. That default is why retail was dark: the
    // module existed, nothing selected it, and no error was raised.
    return false;
  });
}''', '''export function resolveOfflineWorkflowCatalog(enabledFeatures?: string[]) {
  const features = new Set(enabledFeatures ?? []);
  // An entry that names no feature is always in scope; one that names some is
  // in scope when the tenant has any of them. The old default warmed nothing
  // for a vertical the resolver did not know, which is how retail went dark
  // once; an entry now says what selects it, and nothing is dark by omission.
  return registeredOfflineWorkflows().filter((entry) =>
    entry.requiredFeatures ? entry.requiredFeatures.some((feature) => features.has(feature)) : true,
  );
}''', 1)
    assert "registeredOfflineWorkflows().filter" in functions
    functions=functions.replace("Object.entries(OFFLINE_EXCLUDED_ROUTE_REASONS)", "Object.entries(registeredOfflineExcludedRoutes())")
    assert "OFFLINE_WORKFLOW_CATALOG" not in functions and "OFFLINE_EXCLUDED_ROUTE_REASONS" not in functions
    mod='''/**
 * Which screens work offline, for whom, and which are kept online on purpose.
 *
 * The catalogue is data the modules own and the host registers on both sides
 * (`modules.client.ts`); this file keeps the registry and the questions the
 * runtime asks of it, and names no module.
 */
import { registry } from "@corelithzw/platform/registry";
import type { OfflineMutationPolicy, OfflineWorkflowCatalogEntry } from "./types";

'''+head[head.index("function routeMatches("):]+'''const catalogue = registry<{ entries: readonly OfflineWorkflowCatalogEntry[]; excluded: Readonly<Record<string, string>> }>(
  "offline.workflows",
  () => ({ entries: [], excluded: {} }),
);

export function registerOfflineWorkflows(
  entries: readonly OfflineWorkflowCatalogEntry[],
  excludedRouteReasons: Readonly<Record<string, string>> = {},
): void {
  catalogue.entries = entries;
  catalogue.excluded = excludedRouteReasons;
}

export function registeredOfflineWorkflows(): readonly OfflineWorkflowCatalogEntry[] {
  return catalogue.entries;
}

export function registeredOfflineExcludedRoutes(): Readonly<Record<string, string>> {
  return catalogue.excluded;
}

'''+functions
    open(p,"w").write(mod)
    edit(f"{APP}/lib/offline/types.ts", [("export type OfflineWorkflowCatalogEntry = {\n", "export type OfflineWorkflowCatalogEntry = {\n  /** Features any of which puts this workflow in scope; absent, it always is. */\n  requiredFeatures?: readonly string[];\n", 1)])
    # the host wires both sides
    open(f"{APP}/modules.client.ts","w").write('''/**
 * How this host is wired in the browser.
 *
 * What the offline runtime warms and syncs is data with sync adapters in it —
 * code, so it is not a manifest, and it runs in the browser, so `modules.ts`
 * (server only) cannot register it. Imported by the providers in the browser
 * and by `modules.ts` on the server, so both sides answer the same.
 */
import { registerOfflineModules } from "@corelithzw/module-offline/module-registry";
import { registerOfflineWorkflows } from "@corelithzw/module-offline/workflow-catalog";
import { OFFLINE_MODULES } from "@/lib/host/offline-modules";
import { OFFLINE_EXCLUDED_ROUTE_REASONS, OFFLINE_WORKFLOW_CATALOG } from "@/lib/host/offline-workflows";

registerOfflineModules(OFFLINE_MODULES);
registerOfflineWorkflows(OFFLINE_WORKFLOW_CATALOG, OFFLINE_EXCLUDED_ROUTE_REASONS);
''')
    edit(f"{APP}/modules.ts", [('import "./manifests";\n', 'import "./manifests";\nimport "./modules.client";\n', 1)])
    edit(f"{APP}/components/providers/app-providers.tsx", [('import "@/manifests";\n', 'import "@/manifests";\nimport "@/modules.client";\n', 1)])
    # the catalogue test reads the host's data and the module's questions
    sh(f'git mv "{APP}/lib/offline/workflow-catalog.test.ts" "{APP}/lib/host/offline-workflow-catalog.test.ts"')
    p=f"{APP}/lib/host/offline-workflow-catalog.test.ts"; s=open(p).read()
    s=s.replace('import { OFFLINE_MODULES } from "@/lib/offline/module-registry";', 'import "@/modules.client";\nimport { OFFLINE_MODULES } from "@/lib/host/offline-modules";')
    s=re.sub(r'import \{([^}]*)\} from "@/lib/offline/workflow-catalog";', lambda m: 'import { OFFLINE_WORKFLOW_CATALOG } from "@/lib/host/offline-workflows";\nimport {'+m.group(1).replace("OFFLINE_WORKFLOW_CATALOG,","").replace("  OFFLINE_WORKFLOW_CATALOG\n","")+'} from "@corelithzw/module-offline/workflow-catalog";', s)
    assert '@/lib/host/offline-workflows' in s and 'import "@/modules.client"' in s
    open(p,"w").write(s)
    print("split: engine and registries in the module; definitions and catalogue in the host")

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py offline")
    move_tree(f"{APP}/lib/offline", PKG)
    move_tree(f"{APP}/components/offline", f"{PKG}/components")
    os.makedirs(f"{PKG}/hooks", exist_ok=True)
    sh(f'git mv "{APP}/components/providers/offline-provider.tsx" "{PKG}/components/offline-provider.tsx"')
    sh(f'git mv "{APP}/hooks/use-offline-connectivity.ts" "{PKG}/hooks/use-offline-connectivity.ts"')
    # the offline chrome that lived with the app shell
    for f in ["offline-status-button.tsx","offline-runtime-panel.tsx","offline-status-tone.ts"]:
        sh(f'git mv "{APP}/components/layout/{f}" "{PKG}/components/{f}"')
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["framer-motion","@tanstack/react-query","next-auth"]: d["dependencies"][dep]=app["dependencies"][dep]
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    d["description"]="Offline: the runtime, outbox, sync engine, entity store and chrome that keep the till and the workforce screens working without a network."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("rewrite"):
    SPEC=re.compile(r'(["\'])(@/[^"\']+)\1'); n=0
    for p in walk(APP):
        s=open(p).read(); new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
        if new!=s: open(p,"w").write(new); n+=1
    m=0
    for p in walk(PKG):
        s=open(p).read(); d=os.path.dirname(p)
        def repl(mm):
            t=target(mm.group(2)) if mm.group(2).startswith("@/") else mm.group(2)
            if not t: return mm.group(0)
            if not t.startswith("@corelithzw/module-offline/"): return f'{mm.group(1)}{t}{mm.group(1)}'
            r=os.path.relpath(os.path.join(PKG, t[len("@corelithzw/module-offline/"):]), d)
            return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
        new=re.compile(r'(["\'])(@/[^"\']+|@corelithzw/module-offline/[^"\']+)\1').sub(repl, s)
        if new!=s: open(p,"w").write(new); m+=1
    print(f"rewritten app={n} package={m}")

if want("seams"):
    open(f"{PKG}/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Offline: the runtime that keeps screens working without a network. Which
 * screens, and how their writes sync, is what the owning modules register
 * (`registerOfflineModules`, `registerOfflineWorkflows`). Data only.
 */
export const manifest: ModuleManifest = {
  id: "offline",
};
''')
    open(f"{PKG}/index.ts","a").write('''
// ── Composition ─────────────────────────────────────────────────────────────
// The manifest a host composes with, and the registries it fills on both
// sides (`modules.client.ts`): which offline modules exist, which workflows.
export { manifest } from "./manifest";
export { registerOfflineModules, registeredOfflineModules } from "./module-registry";
export { registerOfflineWorkflows, registeredOfflineWorkflows } from "./workflow-catalog";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-offline

What keeps the till and the workforce screens working without a network.

```
runtime, lifecycle-machine, session-*, tenant-context, bootstrap-state   the offline session
db, db-v2, entity-store, outbox, query-cache, attachment-store, client-storage   what is kept locally
sync-engine, module-registry, conflict-resolver                           syncing the outbox through the modules' adapters
workflow-catalog                                                          which screens work offline, for whom
service-worker/sw.ts                                                      the worker source (built into the host's public/sw.js)
components/                                                               the provider, banner, keypad, sync panel, badges
hooks/use-offline-connectivity
manifest.ts                                                               id "offline"; requires nothing
```

The module names no other module. The definitions — which routes to warm,
which queries to preload, how to sync a held sale — and the workflow
catalogue are registered by the host on both sides (`modules.client.ts`),
and move into the modules that own the screens as their manifests grow.
''')
    edit(f"{APP}/manifests.ts", [
        ('import { manifest as records } from "@corelithzw/module-records/manifest";\n', 'import { manifest as offline } from "@corelithzw/module-offline/manifest";\nimport { manifest as records } from "@corelithzw/module-records/manifest";\n', 1),
        ('registerModules([workflow, notifications, records, documents, books, ', 'registerModules([workflow, notifications, offline, records, documents, books, ', 1),
    ])
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
