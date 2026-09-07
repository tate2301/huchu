"""Phase 2.3i-stock: the stock module — lib/inventory and the inventory/stores components. Also: the CRM's
history feed, rich text and setup chrome leave the CRM (records and ui), because stock's screens use them."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/stock"; REC=f"{ROOT}/packages/modules/records"; UI=f"{ROOT}/packages/ui"
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
def relativise(base, prefix):
    c=0
    for p in walk(base):
        s=open(p).read(); d=os.path.dirname(p)
        def repl(m):
            r=os.path.relpath(os.path.join(base, m.group(2)), d)
            return f'{m.group(1)}{r if r.startswith(".") else "./"+r}{m.group(1)}'
        new=re.sub(r'(["\'])'+re.escape(prefix)+r'([^"\']+)\1', repl, s)
        if new!=s: open(p,"w").write(new); c+=1
    return c
steps=sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps

MAP=[("@/lib/inventory/","@corelithzw/module-stock/"),("@/components/inventory/","@corelithzw/module-stock/components/"),("@/components/stores/","@corelithzw/module-stock/components/"),
     ("@/lib/crm/rich-text","@corelithzw/module-records/rich-text"),("@/components/crm/collaboration/rich-text-renderer","@corelithzw/module-records/components/rich-text-renderer"),
     ("@/components/crm/records/history-feed","@corelithzw/module-records/components/history-feed"),("@/components/crm/settings/setup-chrome","@corelithzw/ui/layout/setup-chrome")]
def target(spec):
    for old,new in MAP:
        if old.endswith("/"):
            if spec.startswith(old): return new+spec[len(old):]
        elif spec==old: return new
    return None

if want("move"):
    # the CRM pieces stock's screens borrow, to where they belong
    sh(f'git mv "{APP}/lib/crm/rich-text.ts" "{REC}/rich-text.ts"')
    sh(f'git mv "{APP}/components/crm/collaboration/rich-text-renderer.tsx" "{REC}/components/rich-text-renderer.tsx"')
    sh(f'git mv "{APP}/components/crm/records/history-feed.tsx" "{REC}/components/history-feed.tsx"')
    sh(f'git mv "{APP}/components/crm/settings/setup-chrome.tsx" "{UI}/layout/setup-chrome.tsx"')
    sh(f"python3 {SCRATCH}/new_module.py stock people")
    os.makedirs(f"{PKG}/components", exist_ok=True)
    sh(f'git mv "{APP}/lib/inventory/shelf-price-integrity.test.ts" "{APP}/lib/host/shelf-price-integrity.test.ts"')
    for f in sorted(os.listdir(f"{APP}/lib/inventory")): sh(f'git mv "{APP}/lib/inventory/{f}" "{PKG}/{f}"')
    os.rmdir(f"{APP}/lib/inventory")
    for d in ("inventory","stores"):
        for f in sorted(os.listdir(f"{APP}/components/{d}")): sh(f'git mv "{APP}/components/{d}/{f}" "{PKG}/components/{f}"')
        os.rmdir(f"{APP}/components/{d}")
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@tanstack/react-query","@corelithzw/react","date-fns","@corelithzw/shell"]:
        d["dependencies"][dep]="workspace:*" if dep.startswith("@corelithzw/") else app["dependencies"][dep]
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    d["description"]="Stock: the catalogue, price lists, stock locations and movements — what the business holds, and what it sells."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("client"):
    header='''/** The stock screens' client: what the browser asks of `/api/inventory` and `/api/stock-locations`. */
import { buildQuery, fetchJson, type Pagination } from "@corelithzw/platform/api-client";

'''
    open(f"{SCRATCH}/stock-client-header.txt","w").write(header)
    sh(f'python3 {SCRATCH}/apislice.py "{PKG}/api-client.ts" "{SCRATCH}/stock-client-header.txt" "InventoryItem,StockLocation,StockMovement,fetchInventoryItems,fetchStockMovements,fetchStockLocations" "@corelithzw/module-stock/api-client"')
    print("client sliced")

if want("rewrite"):
    SPEC=re.compile(r'(["\'])(@/[^"\']+)\1'); n=0
    for p in walk(APP):
        s=open(p).read(); new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
        if new!=s: open(p,"w").write(new); n+=1
    for base in (PKG, REC, UI):
        for p in walk(base):
            s=open(p).read(); new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
            if new!=s: open(p,"w").write(new)
    a=relativise(PKG,"@corelithzw/module-stock/"); b=relativise(REC,"@corelithzw/module-records/"); c=relativise(UI,"@corelithzw/ui/")
    # the stock components' remaining lib/api calls: sites from the kernel, employees from the people directory, the rest from its own client
    for p in walk(f"{PKG}/components"):
        s=open(p).read()
        m=re.search(r'import \{([^}]*)\} from "@/lib/api";\n', s)
        if not m: continue
        names=[x.strip() for x in m.group(1).split(",") if x.strip()]
        lines=[]
        own=[x for x in names if x in ("fetchInventoryItems","fetchStockMovements","fetchStockLocations","InventoryItem","StockLocation","StockMovement") or x.startswith("type ")]
        if "fetchSites" in names: lines.append('import { fetchSites } from "@corelithzw/platform/client/sites";\n')
        if "fetchEmployees" in names: lines.append('import { fetchEmployees } from "@corelithzw/module-people/directory";\n')
        rest=[x for x in names if x not in ("fetchSites","fetchEmployees")]
        if rest: lines.append('import { '+", ".join(rest)+' } from "../api-client";\n')
        s=s.replace(m.group(0), "".join(lines)); open(p,"w").write(s)
    print(f"rewritten app={n} stock={a} records={b} ui={c}")

if want("seams"):
    open(f"{PKG}/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Stock: the catalogue, price lists, stock locations and movements. What the
 * business holds and what it sells; the CRM quotes from it and the till sells
 * from it, so both require it. Data only.
 */
export const manifest: ModuleManifest = {
  id: "stock",
  requires: ["people"],
};
''')
    open(f"{PKG}/index.ts","w").write('// Deep imports are the norm (`@corelithzw/module-stock/catalogue`); this entry\n// carries the manifest a host composes with.\nexport { manifest } from "./manifest";\n')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-stock

What the business holds, and what it sells.

```
catalogue.ts, catalogue-service.ts, catalogue-adapters.ts   products, price lists, units, resolving a price
stock-movements.ts                                          receipts, issues, transfers and the ledger they keep
api-client.ts                                               the browser's client for /api/inventory and /api/stock-locations
components/                                                 the stores shell, stock overview, movements feed, locations, catalogue and price-list panels
manifest.ts                                                 id "stock"; requires people (the storeman an issue goes to)
```

Import by path: `import { resolvePrice } from "@corelithzw/module-stock/catalogue"`.
''')
    edit(f"{APP}/manifests.ts", [
        ('import { manifest as records } from "@corelithzw/module-records/manifest";\n', 'import { manifest as records } from "@corelithzw/module-records/manifest";\nimport { manifest as stock } from "@corelithzw/module-stock/manifest";\n', 1),
        ('registerModules([workflow, notifications, records, documents, books, ', 'registerModules([workflow, notifications, records, documents, books, stock, ', 1),
    ])
    print("seams done")

if want("check"):
    left=[]
    for base in (PKG, REC, UI):
        for p in walk(base):
            if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, ROOT))
    print("package files importing '@/':", left or "none")
