"""Phase 2.3i (gold): the gold module — the mine's gold books, settlements, operations and executive dashboard.
Composed only into this host."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/gold"
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
MAP=[("@/lib/gold/","@corelithzw/module-gold/gold/"),("@/lib/settlements/","@corelithzw/module-gold/settlements/"),("@/lib/operations/","@corelithzw/module-gold/operations/"),
     ("@/lib/dashboard/","@corelithzw/module-gold/dashboard/"),("@/components/gold/","@corelithzw/module-gold/components/gold/"),("@/components/dashboard/","@corelithzw/module-gold/components/dashboard/"),
     ("@/app/gold/routes","@corelithzw/module-gold/routes"),("@/app/gold/types","@corelithzw/module-gold/types"),("@/lib/commodity-billing","@corelithzw/module-gold/commodity-billing")]
def target(spec):
    for old,new in MAP:
        if old.endswith("/"):
            if spec.startswith(old): return new+spec[len(old):]
        elif spec==old: return new
    return None
HOME={"fetchSites":'@corelithzw/platform/client/sites',"Site":'@corelithzw/platform/client/sites',
      "fetchEmployees":'@corelithzw/module-people/directory',"EmployeeSummary":'@corelithzw/module-people/directory',
      "fetchShiftGroups":'@corelithzw/module-people/directory',"fetchShiftGroupMembers":'@corelithzw/module-people/directory',
      "ShiftGroupRecord":'@corelithzw/module-people/directory',"ShiftGroupMemberRecord":'@corelithzw/module-people/directory'}
CLIENT=["BuyerReceipt","GoldPour","GoldDispatchBatchEntry","GoldDispatch","GoldPurchase","GoldShiftAllocationExpense","GoldShiftAllocationWorkerShare","GoldShiftAllocation","GoldCorrection","GoldPriceRecord","GoldExpenseType",
        "ExecutiveRange","ExecutiveKpiTone","ExecutiveKpiCard","ExecutiveTrendPoint","ExecutiveCashTrendPoint","ExecutiveBreakdownPoint","ExecutiveCharts","ExecutiveHighlight","ExecutiveQuickLink","ExecutiveModuleStatus","ExecutiveSummaryMetric","ExecutiveModuleSummary","ExecutiveDashboardResponse",
        "fetchExecutiveDashboardOverview","fetchGoldPours","fetchGoldDispatches","fetchGoldReceipts","fetchGoldPurchases","fetchGoldShiftAllocations","fetchGoldCorrections","fetchGoldPrices","createGoldPrice","updateGoldPrice","fetchGoldExpenseTypes"]

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py gold people,books,records,workflow")
    move_tree(f"{APP}/lib/gold", f"{PKG}/gold")
    if os.path.exists(f"{PKG}/manifest.ts"): os.remove(f"{PKG}/manifest.ts")
    if os.path.exists(f"{PKG}/gold/manifest.ts"): sh(f'git mv "{PKG}/gold/manifest.ts" "{PKG}/manifest.ts"')
    move_tree(f"{APP}/lib/settlements", f"{PKG}/settlements")
    move_tree(f"{APP}/lib/operations", f"{PKG}/operations")
    move_tree(f"{APP}/lib/dashboard", f"{PKG}/dashboard")
    move_tree(f"{APP}/components/gold", f"{PKG}/components/gold")
    move_tree(f"{APP}/components/dashboard", f"{PKG}/components/dashboard")
    sh(f'git mv "{APP}/app/gold/routes.ts" "{PKG}/routes.ts"'); sh(f'git mv "{APP}/app/gold/types.ts" "{PKG}/types.ts"')
    sh(f'git mv "{APP}/lib/commodity-billing.ts" "{PKG}/commodity-billing.ts"'); sh(f'git mv "{APP}/lib/commodity-billing.test.ts" "{PKG}/commodity-billing.test.ts"')
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@tanstack/react-query","@corelithzw/react","date-fns","@corelithzw/shell","@corelithzw/module-documents","@corelithzw/module-notifications"]:
        d["dependencies"][dep]="workspace:*" if dep.startswith("@corelithzw/") and dep!="@corelithzw/react" else app["dependencies"][dep]
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    d["description"]="Gold: the mine's gold books, settlements, plant and shift operations and the executive dashboard. Composed only into the enterprise host."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("client"):
    header='''/** The gold screens' client: what the browser asks of `/api/gold`, `/api/settlements` and `/api/dashboard`. */
import { buildQuery, fetchJson, type Pagination } from "@corelithzw/platform/api-client";
import type { Site } from "@corelithzw/platform/client/sites";

'''
    open(f"{SCRATCH}/gold-client-header.txt","w").write(header)
    sh(f'python3 {SCRATCH}/apislice.py "{PKG}/api-client.ts" "{SCRATCH}/gold-client-header.txt" "{",".join(CLIENT)}" "@corelithzw/module-gold/api-client"')
    print("client sliced")

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
            if not t.startswith("@corelithzw/module-gold/"): return f'{mm.group(1)}{t}{mm.group(1)}'
            r=os.path.relpath(os.path.join(PKG, t[len("@corelithzw/module-gold/"):]), d)
            return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
        new=re.compile(r'(["\'])(@/[^"\']+|@corelithzw/module-gold/[^"\']+)\1').sub(repl, s)
        for mm in list(re.finditer(r'import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@/lib/api";\n', new)):
            typeonly=bool(mm.group(1))
            names=[x.strip() for x in mm.group(2).split(",") if x.strip()]
            groups=collections.OrderedDict()
            for x in names:
                bare=x.replace("type ","").strip().split(" as ")[0].strip()
                home=HOME.get(bare, None)
                if not home and bare in CLIENT:
                    r=os.path.relpath(os.path.join(PKG,"api-client"), d); home=r if r.startswith(".") else "./"+r
                assert home, (p, bare)
                groups.setdefault(home, []).append(x)
            new=new.replace(mm.group(0), "".join(f'import {"type " if typeonly else ""}{{ {", ".join(v)} }} from "{k}";\n' for k,v in groups.items()))
        if new!=s: open(p,"w").write(new); m+=1
    print(f"rewritten app={n} package={m}")

if want("seams"):
    p=f"{PKG}/manifest.ts"; s=open(p).read()
    s=s.replace(''' *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */''', ''' * Data only.
 */''')
    s=s.replace('  id: "gold",\n', '  id: "gold",\n  requires: ["people", "books", "records", "workflow"],\n', 1)
    open(p,"w").write(s)
    open(f"{PKG}/index.ts","w").write('// Deep imports are the norm (`@corelithzw/module-gold/gold/valuation`); this\n// entry carries the manifest a host composes with.\nexport { manifest } from "./manifest";\n')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-gold

The mine: gold receipts, pours, dispatches, purchases and prices; the crews'
settlements; plant and shift operations; the executive dashboard.

```
gold/            the gold books: receipts, pours, dispatches, purchases, prices, valuation, search, payouts
settlements/     what a crew is owed and paid
operations/      shifts, plant, downtime, the search arm
dashboard/       the executive summary
commodity-billing.ts
routes.ts, types.ts   the gold screens' routes and shared shapes
api-client.ts    the browser's client
components/      the gold and dashboard screens
manifest.ts      id "gold"; requires people, books, records, workflow
```

Composed only into the enterprise host; never into a marketed product.
''')
    # the rewrite pass already turned @/lib/gold/manifest into the package's gold/ subpath; the manifest sits at the root
    edit(f"{APP}/manifests.ts", [('import { manifest as gold } from "@corelithzw/module-gold/gold/manifest";\n', 'import { manifest as gold } from "@corelithzw/module-gold/manifest";\n', 1)])
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
