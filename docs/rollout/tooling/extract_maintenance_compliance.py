"""Phase 2.3i (maintenance, compliance): two add-on modules — their screens, their clients, their manifests. Also the
kernel's users client, which both borrow."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PLAT=f"{ROOT}/packages/platform"
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
steps=sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps
PKGS={"maintenance": f"{ROOT}/packages/modules/maintenance", "compliance": f"{ROOT}/packages/modules/compliance"}
CLIENT={"maintenance": ["Equipment","WorkOrder","fetchEquipment","fetchWorkOrders"],
        "compliance": ["PermitRecord","InspectionRecord","IncidentRecord","TrainingRecordSummary","fetchPermits","fetchInspections","fetchIncidents","fetchTrainingRecords"]}
# where each borrowed client name now lives
HOME={"fetchSites":'@corelithzw/platform/client/sites', "Site":'@corelithzw/platform/client/sites',
      "fetchUsers":'@corelithzw/platform/client/users', "UserSummary":'@corelithzw/platform/client/users',
      "fetchEmployees":'@corelithzw/module-people/directory', "EmployeeSummary":'@corelithzw/module-people/directory',
      "fetchStockLocations":'@corelithzw/module-stock/api-client', "StockLocation":'@corelithzw/module-stock/api-client'}

if want("kernel"):
    api=open(f"{APP}/lib/api.ts").read()
    header='/** The browser\'s client for the kernel\'s users. */\nimport { buildQuery, fetchJson, type Pagination } from "../api-client";\n\n'
    open(f"{SCRATCH}/users-client-header.txt","w").write(header)
    sh(f'python3 {SCRATCH}/apislice.py "{PLAT}/client/users.ts" "{SCRATCH}/users-client-header.txt" "UserSummary,fetchUsers" "@corelithzw/platform/client/users"')
    print("kernel: client/users")

if want("move"):
    for mid, req in [("maintenance","stock,people,documents"),("compliance","people,documents")]:
        PKG=PKGS[mid]
        sh(f"python3 {SCRATCH}/new_module.py {mid} {req}")
        os.makedirs(f"{PKG}/components", exist_ok=True)
        for f in sorted(os.listdir(f"{APP}/components/{mid}")): sh(f'git mv "{APP}/components/{mid}/{f}" "{PKG}/components/{f}"')
        os.rmdir(f"{APP}/components/{mid}")
        if os.path.exists(f"{PKG}/manifest.ts"): os.remove(f"{PKG}/manifest.ts")
        sh(f'git mv "{APP}/lib/{mid}/manifest.ts" "{PKG}/manifest.ts"')
        if not os.listdir(f"{APP}/lib/{mid}"): os.rmdir(f"{APP}/lib/{mid}")
        p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
        for dep in ["@tanstack/react-query","@corelithzw/react","date-fns","zod","@corelithzw/shell"]:
            d["dependencies"][dep]="workspace:*" if dep.startswith("@corelithzw/") and dep!="@corelithzw/react" else app["dependencies"][dep]
        if mid=="maintenance": d["dependencies"]["next-auth"]=app["dependencies"]["next-auth"]
        d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
        d["description"]={"maintenance":"Maintenance: work orders, equipment, breakdowns and the schedule. An add-on module.","compliance":"Compliance: permits, inspections, incidents and training records. An add-on module."}[mid]
        json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("client"):
    for mid in PKGS:
        header=f'/** The {mid} screens\' client. */\nimport {{ buildQuery, fetchJson, type Pagination }} from "@corelithzw/platform/api-client";\n\n'
        open(f"{SCRATCH}/{mid}-client-header.txt","w").write(header)
        sh(f'python3 {SCRATCH}/apislice.py "{PKGS[mid]}/api-client.ts" "{SCRATCH}/{mid}-client-header.txt" "{",".join(CLIENT[mid])}" "@corelithzw/module-{mid}/api-client"')
    print("clients sliced")

if want("rewrite"):
    n=0
    for p in walk(APP):
        s=open(p).read()
        new=re.sub(r'(["\'])@/components/(maintenance|compliance)/([^"\']+)\1', lambda m: f'{m.group(1)}@corelithzw/module-{m.group(2)}/components/{m.group(3)}{m.group(1)}', s)
        if new!=s: open(p,"w").write(new); n+=1
    for mid, PKG in PKGS.items():
        for p in walk(PKG):
            s=open(p).read(); d=os.path.dirname(p)
            def rel(t):
                r=os.path.relpath(os.path.join(PKG,t), d); return r if r.startswith(".") else "./"+r
            new=re.sub(r'(["\'])@/components/'+mid+r'/([^"\']+)\1', lambda m: f'{m.group(1)}{rel("components/"+m.group(2))}{m.group(1)}', s)
            # lib/api names: own client, or where the name lives now
            m=re.search(r'import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@/lib/api";\n', new)
            if m:
                names=[x.strip() for x in m.group(2).split(",") if x.strip()]
                groups=collections.OrderedDict()
                for x in names:
                    bare=x.replace("type ","").strip()
                    home=HOME.get(bare, rel("api-client") if bare in CLIENT[mid] else None)
                    assert home, (p, bare)
                    groups.setdefault(home, []).append(x)
                lines="".join(f'import {{ {", ".join(v)} }} from "{k}";\n' for k,v in groups.items())
                new=new.replace(m.group(0), lines)
            if new!=s: open(p,"w").write(new)
    print(f"rewritten app={n}")

if want("seams"):
    for mid, req, doc in [("maintenance",'["stock", "people", "documents"]',"Maintenance: work orders, equipment, breakdowns and the schedule. An add-on."),("compliance",'["people", "documents"]',"Compliance: permits, inspections, incidents and training records. An add-on.")]:
        PKG=PKGS[mid]; p=f"{PKG}/manifest.ts"; s=open(p).read()
        s=re.sub(r'/\*\*.*?\*/\n', f'/**\n * {doc} Data only.\n */\n', s, count=1, flags=re.S)
        s=s.replace(f'  id: "{mid}",\n', f'  id: "{mid}",\n  requires: {req},\n', 1)
        open(p,"w").write(s)
        open(f"{PKG}/index.ts","w").write(f'// Deep imports are the norm (`@corelithzw/module-{mid}/components/...`); this\n// entry carries the manifest a host composes with.\nexport {{ manifest }} from "./manifest";\n')
        open(f"{PKG}/README.md","w").write(f"# @corelithzw/module-{mid}\n\n{doc}\n\n```\napi-client.ts   the browser's client\ncomponents/     the screens\nmanifest.ts     id \"{mid}\"; requires {req}\n```\n\nThe API routes, the notification emitters and the pages stay in the host until\nthe first product host composes this module.\n")
        edit(f"{APP}/manifests.ts", [(f'import {{ manifest as {mid} }} from "@/lib/{mid}/manifest";\n', f'import {{ manifest as {mid} }} from "@corelithzw/module-{mid}/manifest";\n', 1)])
    print("seams done")

if want("check"):
    left=[]
    for PKG in PKGS.values():
        for p in walk(PKG):
            if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, ROOT))
    print("package files importing '@/':", left or "none")
