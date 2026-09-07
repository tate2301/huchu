"""Phase 3.0b: the sell module — lib/retail and components/retail as @corelithzw/module-sell (manifest id "retail");
the transaction engine out of the route directory."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/sell"
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
MAP=[("@/lib/retail","@corelithzw/module-sell"),("@/lib/retail/","@corelithzw/module-sell/"),("@/components/retail/","@corelithzw/module-sell/components/"),
     ("@/app/api/v2/retail/_services","@corelithzw/module-sell/transactions")]
def target(spec):
    for old,new in MAP:
        if old.endswith("/"):
            if spec.startswith(old): return new+spec[len(old):]
        elif spec==old: return new
    return None

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py sell books,offline,records,stock")
    for f in ["manifest.ts","index.ts"]:
        if os.path.exists(f"{PKG}/{f}"): os.remove(f"{PKG}/{f}")
    # the tests that read the host go to lib/host
    sh(f'git mv "{APP}/lib/retail/route-guard-coverage.test.ts" "{APP}/lib/host/retail-route-guard-coverage.test.ts"')
    sh(f'git mv "{APP}/lib/retail/areas.test.ts" "{APP}/lib/host/retail-areas.test.ts"')
    move_tree(f"{APP}/lib/retail", PKG)
    move_tree(f"{APP}/components/retail", f"{PKG}/components")
    sh(f'git mv "{APP}/app/api/v2/retail/_services.ts" "{PKG}/transactions.ts"')
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@tanstack/react-query","@corelithzw/react","date-fns","bcryptjs","next-auth"]:
        if dep in app["dependencies"]: d["dependencies"][dep]=app["dependencies"][dep]
    d["dependencies"]["@corelithzw/shell"]="workspace:*"
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    if "@types/bcryptjs" in app.get("devDependencies",{}): d["devDependencies"]["@types/bcryptjs"]=app["devDependencies"]["@types/bcryptjs"]; d["devDependencies"]=collections.OrderedDict(sorted(d["devDependencies"].items()))
    d["description"]="Sell: the till and its shifts, sales, refunds and Z reports, cash-up, shelf pricing, fiscalisation, the POS portal and its offline runtime. The retail product's module; manifest id \"retail\"."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("rewrite"):
    SPEC=re.compile(r'(["\'])(@/[^"\']+)\1'); n=0
    for p in walk(APP):
        s=open(p).read(); new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
        if "/app/api/v2/retail/" in p:
            new=re.sub(r'(["\'])(?:\.\./)+_services\1', r'\1@corelithzw/module-sell/transactions\1', new)
        if new!=s: open(p,"w").write(new); n+=1
    m=0
    for p in walk(PKG):
        s=open(p).read(); d=os.path.dirname(p)
        def repl(mm):
            t=target(mm.group(2)) if mm.group(2).startswith("@/") else mm.group(2)
            if not t: return mm.group(0)
            if t=="@corelithzw/module-sell": r=os.path.relpath(os.path.join(PKG,"index"), d); return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
            if not t.startswith("@corelithzw/module-sell/"): return f'{mm.group(1)}{t}{mm.group(1)}'
            r=os.path.relpath(os.path.join(PKG, t[len("@corelithzw/module-sell/"):]), d)
            return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
        new=re.compile(r'(["\'])(@/[^"\']+|@corelithzw/module-sell(?:/[^"\']+)?)\1').sub(repl, s)
        new=new.replace('from "@corelithzw/module-gold/types"', 'from "@corelithzw/ui/components/searchable-select"')
        if new!=s: open(p,"w").write(new); m+=1
    print(f"rewritten app={n} package={m}")

if want("seams"):
    open(f"{PKG}/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Sell: the till and everything around it. The manifest id is "retail", the
 * schema's module name, which the features and the routes carry; the product
 * the module makes is Sell, and the package is named for it. Data only.
 */
export const manifest: ModuleManifest = {
  id: "retail",
  requires: ["books", "offline", "records", "stock"],
};
''')
    open(f"{PKG}/index.ts","a").write('''
// ── Composition ─────────────────────────────────────────────────────────────
// The manifest a host composes with.
export { manifest } from "./manifest";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-sell

The till: shifts, sales, refunds and voids, cash movements and cash-up, Z
reports, shelf pricing and listings, tender and till policy, the manager
override, ZIMRA fiscalisation of a sale, the POS portal and the offline
runtime that keeps it selling.

```
transactions.ts     the transaction engine: open and close a shift, a sale, a refund, a void, a Z report
checkout, sale-totals, tender-policy, till-*, cash-up, z-report   the domain
offline-*.ts, pos-offline-queue.ts   what the POS keeps and syncs without a network
fiscalisation.ts    a sale into the fiscal drain
pos-host.ts         which host serves the POS portal (the host's auth and proxy ask it)
permissions.ts      the retail resources and actions
components/         the retail shell, the sale detail, the POS portal, the reports
manifest.ts         id "retail"; requires books, offline, records, stock
```

Import by path: `import { createRetailSaleTransaction } from "@corelithzw/module-sell/transactions"`.

The API routes and the pages stay in the host until the Sell host composes
this module; the manifest id stays `retail`, the schema's name for it.
''')
    edit(f"{APP}/manifests.ts", [
        ('import { manifest as records } from "@corelithzw/module-records/manifest";\n', 'import { manifest as records } from "@corelithzw/module-records/manifest";\nimport { manifest as retail } from "@corelithzw/module-sell/manifest";\n', 1),
        ('registerModules([workflow, notifications, offline, records, documents, books, stock, ', 'registerModules([workflow, notifications, offline, records, documents, books, stock, retail, ', 1),
    ])
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
