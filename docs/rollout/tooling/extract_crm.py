"""Phase 3.0c: the crm module — lib/crm and components/crm as @corelithzw/module-crm; its notification emitters out of the
host's lib/notifications.ts; the permission matrix to the shell."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/crm"; SH=f"{ROOT}/packages/shell"
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
MAP=[("@/lib/crm/","@corelithzw/module-crm/"),("@/components/crm/","@corelithzw/module-crm/components/"),
     ("@/components/user-management/permission-matrix","@corelithzw/shell/permission-matrix")]
def target(spec):
    for old,new in MAP:
        if old.endswith("/"):
            if spec.startswith(old): return new+spec[len(old):]
        elif spec==old: return new
    return None
EMITTERS={"emitCrmNotification","getCrmManagerRecipients"}

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py crm records,documents,books,stock,notifications")
    if os.path.exists(f"{PKG}/manifest.ts"): os.remove(f"{PKG}/manifest.ts")
    move_tree(f"{APP}/lib/crm", PKG)
    move_tree(f"{APP}/components/crm", f"{PKG}/components")
    sh(f'git mv "{APP}/components/user-management/permission-matrix.tsx" "{SH}/permission-matrix.tsx"')
    # the CRM's emitters out of the host's notifications file
    p=f"{APP}/lib/notifications.ts"; s=open(p).read()
    a=s.index("export async function emitCrmNotification("); b=s.index("export async function getCrmManagerRecipients(")
    c=s.index("\n}\n", b)+3
    block=s[a:c]
    s=s[:a].rstrip("\n")+"\n"+s[c:]
    open(p,"w").write(s)
    used=lambda name: re.search(r'\b'+name+r'\b', block) is not None
    db=[n for n in ["NotificationEntityType","NotificationSeverity","NotificationSourceAction","NotificationType"] if used(n)]
    svc=[n for n in ["createNotification","getManagerIds","filterRecipientsForCategory"] if used(n)]
    header='/** The CRM\'s notices: who is told when a lead moves, a discount waits, a comment lands. */\n'
    if db: header+='import { '+", ".join(db)+' } from "@corelithzw/db";\n'
    if used("prisma"): header+='import { prisma } from "@corelithzw/db/client";\n'
    if used("DbClient"): svc.append("type DbClient")
    if svc: header+='import { '+", ".join(svc)+' } from "@corelithzw/module-notifications/service";\n'
    open(f"{PKG}/notifications.ts","w").write(header+"\n"+block)
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@tanstack/react-query","@tanstack/react-table","@corelithzw/react","date-fns","next-auth","bcryptjs","@dnd-kit/core","@dnd-kit/sortable","@dnd-kit/utilities"]:
        if dep in app["dependencies"]: d["dependencies"][dep]=app["dependencies"][dep]
    d["dependencies"]["@corelithzw/shell"]="workspace:*"
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    if "@types/bcryptjs" in app.get("devDependencies",{}): d["devDependencies"]["@types/bcryptjs"]=app["devDependencies"]["@types/bcryptjs"]; d["devDependencies"]=collections.OrderedDict(sorted(d["devDependencies"].items()))
    d["description"]="CRM: leads, people, companies, sites and deals, pipelines, tasks and appointments, quotes and work orders, intake forms, site visits and sign-off, automation, commissions, the collaboration layer. The CRM product's module."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved; emitters sliced")

def rewrite_notification_imports(s, to_crm):
    """`import { emitCrmNotification, x } from "@/lib/notifications"` -> the emitters from the crm module, the rest as it was."""
    out=s
    for mm in list(re.finditer(r'import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@/lib/notifications";?\n', s)):
        names=[x.strip() for x in mm.group(2).split(",") if x.strip()]
        crm=[x for x in names if x.replace("type ","").strip() in EMITTERS]; rest=[x for x in names if x not in crm]
        if not crm: continue
        lines=""
        if crm: lines+=f'import {{ {", ".join(crm)} }} from "{to_crm}";\n'
        if rest: lines+=f'import {{ {", ".join(rest)} }} from "@/lib/notifications";\n'
        out=out.replace(mm.group(0), lines)
    return out

if want("rewrite"):
    SPEC=re.compile(r'(["\'])(@/[^"\']+)\1'); n=0
    for p in walk(APP):
        s=open(p).read(); new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
        new=rewrite_notification_imports(new, "@corelithzw/module-crm/notifications")
        if new!=s: open(p,"w").write(new); n+=1
    m=0
    for base,prefix in ((PKG,"@corelithzw/module-crm/"),(SH,"@corelithzw/shell/")):
        for p in walk(base):
            s=open(p).read(); d=os.path.dirname(p)
            new=rewrite_notification_imports(s, "@corelithzw/module-crm/notifications") if base==PKG else s
            def repl(mm):
                t=target(mm.group(2)) if mm.group(2).startswith("@/") else mm.group(2)
                if not t: return mm.group(0)
                if not t.startswith(prefix): return f'{mm.group(1)}{t}{mm.group(1)}'
                r=os.path.relpath(os.path.join(base, t[len(prefix):]), d)
                return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
            new=re.compile(r'(["\'])(@/[^"\']+|'+re.escape(prefix)+r'[^"\']+)\1').sub(repl, new)
            if new!=s: open(p,"w").write(new); m+=1
    print(f"rewritten app={n} packages={m}")

if want("seams"):
    p=f"{PKG}/manifest.ts"; s=open(p).read()
    s=s.replace('''/**
 * The CRM's manifest, ahead of its move.
 *
 * What the CRM contributes to the kernel is declared here now, so the host
 * composes itself by manifests from today and the move to
 * `packages/modules/crm` is a relocation of this file, not a change to it.
 * Data only: nothing here reaches a database.
 */''', '''/**
 * The CRM's manifest. Data only: nothing here reaches a database.
 */''')
    assert s.count('  requires: ["records", "documents"],')==1
    s=s.replace('  requires: ["records", "documents"],','  requires: ["records", "documents", "books", "stock", "notifications"],')
    open(p,"w").write(s)
    open(f"{PKG}/index.ts","w").write('// Deep imports are the norm (`@corelithzw/module-crm/pipeline`); this entry\n// carries the manifest a host composes with.\nexport { manifest } from "./manifest";\n')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-crm

Leads, people, companies, sites and deals; pipelines, tasks and appointments;
quotes and work orders; intake forms, site visits and sign-off; automation,
lead scoring, commissions; the collaboration layer and the collections a
person keeps to hand.

```
*.ts               the domain, one file per concern
crm-v2.ts, collections-client.ts   the browser's clients
capabilities.ts    what the CRM lets a person do, declared in the manifest
notifications.ts   the CRM's notices, on the notifications service
components/        the screens: records, leads, pipelines, tasks, visits, work orders, reps, settings, the public pages
manifest.ts        id "crm"; requires records, documents, books, stock, notifications
```

Import by path: `import { movePipelineStage } from "@corelithzw/module-crm/pipeline"`.

The API routes, the pages and the public token pages stay in the host until
the CRM host composes this module.
''')
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
