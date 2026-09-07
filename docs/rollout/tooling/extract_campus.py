"""Phase 3.0a: the campus module — lib/schools and components/schools as @corelithzw/module-campus (manifest id "schools").
Also: the generic import engine to the kernel, the fee-posting helper out of the route directory."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/campus"; PLAT=f"{ROOT}/packages/platform"
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
MAP=[("@/lib/schools/","@corelithzw/module-campus/"),("@/components/schools/","@corelithzw/module-campus/components/"),
     ("@/lib/import-core/","@corelithzw/platform/import-core/"),("@/app/api/v2/schools/fees/_helpers","@corelithzw/module-campus/fees-posting")]
def target(spec):
    for old,new in MAP:
        if old.endswith("/"):
            if spec.startswith(old): return new+spec[len(old):]
        elif spec==old: return new
    return None
# where a lib/api name lives now
HOME={"fetchDepartments":"@corelithzw/module-people/directory","DepartmentRecord":"@corelithzw/module-people/directory","EmployeeSummary":"@corelithzw/module-people/directory",
      "fetchSites":"@corelithzw/platform/client/sites","Site":"@corelithzw/platform/client/sites","fetchUsers":"@corelithzw/platform/client/users","UserSummary":"@corelithzw/platform/client/users"}
NOTIF={"archiveNotifications","fetchNotifications","markNotificationsRead","NotificationListItem","fetchNotificationPreferences","updateNotificationPreferences","NotificationPreference","NotificationPreferenceRecord"}

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py campus records,documents,books,offline,people")
    if os.path.exists(f"{PKG}/manifest.ts"): os.remove(f"{PKG}/manifest.ts")
    move_tree(f"{APP}/lib/schools", PKG)
    move_tree(f"{APP}/components/schools", f"{PKG}/components")
    sh(f'git mv "{APP}/app/api/v2/schools/fees/_helpers.ts" "{PKG}/fees-posting.ts"')
    os.makedirs(f"{PLAT}/import-core", exist_ok=True)
    for f in ["csv.ts","plan.ts"]: sh(f'git mv "{APP}/lib/import-core/{f}" "{PLAT}/import-core/{f}"')
    if os.path.isdir(f"{APP}/lib/import-core") and not os.listdir(f"{APP}/lib/import-core"): os.rmdir(f"{APP}/lib/import-core")
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@tanstack/react-query","@tanstack/react-table","@corelithzw/react","date-fns","bcryptjs","next-auth"]:
        if dep in app["dependencies"]: d["dependencies"][dep]=app["dependencies"][dep]
    d["dependencies"]["@corelithzw/shell"]="workspace:*"; d["dependencies"]["@corelithzw/module-notifications"]="workspace:*"
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    if "@types/bcryptjs" in app.get("devDependencies",{}): d["devDependencies"]["@types/bcryptjs"]=app["devDependencies"]["@types/bcryptjs"]; d["devDependencies"]=collections.OrderedDict(sorted(d["devDependencies"].items()))
    d["description"]="Campus: students, guardians, admissions, classes and subjects, timetable, attendance, assessments and results, fees, boarding, transport, library, the parent, student and teacher portals. The school product's module; manifest id \"schools\"."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("rewrite"):
    SPEC=re.compile(r'(["\'])(@/[^"\']+)\1'); n=0
    for p in walk(APP):
        s=open(p).read(); new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
        if "/app/api/v2/schools/fees/" in p:
            new=re.sub(r'(["\'])(?:\.\./)+_helpers\1', r'\1@corelithzw/module-campus/fees-posting\1', new)
        if new!=s: open(p,"w").write(new); n+=1
    m=0
    for base,prefix in ((PKG,"@corelithzw/module-campus/"),(PLAT,"@corelithzw/platform/")):
        for p in walk(base):
            s=open(p).read(); d=os.path.dirname(p)
            def repl(mm):
                t=target(mm.group(2)) if mm.group(2).startswith("@/") else mm.group(2)
                if not t: return mm.group(0)
                if not t.startswith(prefix): return f'{mm.group(1)}{t}{mm.group(1)}'
                r=os.path.relpath(os.path.join(base, t[len(prefix):]), d)
                return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
            new=re.compile(r'(["\'])(@/[^"\']+|'+re.escape(prefix)+r'[^"\']+)\1').sub(repl, s)
            # the CRM's field-definition alias is records' type
            if 'from "@/lib/crm/crm-v2"' in new:
                new=re.sub(r'import type \{ CrmFieldDefinitionRecord \} from "@/lib/crm/crm-v2";', 'import type { FieldDefinitionRecord } from "@corelithzw/module-records/custom-fields";', new)
                new=re.sub(r'\bCrmFieldDefinitionRecord\b', 'FieldDefinitionRecord', new)
            # lib/api names: each to where it lives now
            for mm in list(re.finditer(r'import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@/lib/api";\n', new)):
                typeonly=bool(mm.group(1)); names=[x.strip() for x in mm.group(2).split(",") if x.strip()]
                groups=collections.OrderedDict()
                for x in names:
                    bare=x.replace("type ","").strip().split(" as ")[0].strip()
                    home=HOME.get(bare) or ("@corelithzw/module-notifications/api-client" if bare in NOTIF else None)
                    assert home, (p, bare)
                    groups.setdefault(home, []).append(x)
                new=new.replace(mm.group(0), "".join(f'import {"type " if typeonly else ""}{{ {", ".join(v)} }} from "{k}";\n' for k,v in groups.items()))
            if new!=s: open(p,"w").write(new); m+=1
    print(f"rewritten app={n} packages={m}")

if want("seams"):
    # the people directory grows the departments the school's staff screen reads
    p=f"{ROOT}/packages/modules/people/directory.ts"
    edit(p, [("export {\n  fetchDisciplinaryActions,\n  fetchEmployees,\n", "export {\n  fetchDepartments,\n  fetchDisciplinaryActions,\n  fetchEmployees,\n", 1),
             ("  type DisciplinaryActionRecord,\n", "  type DepartmentRecord,\n  type DisciplinaryActionRecord,\n", 1)])
    p=f"{PKG}/manifest.ts"; s=open(p).read()
    s=s.replace(''' *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */''', ''' *
 * The manifest id is "schools": the schema's module name, which the record
 * types, features and routes carry; the product the module makes is Campus,
 * and the package is named for it. Data only.
 */''')
    s=s.replace('  id: "schools",\n', '  id: "schools",\n  requires: ["records", "documents", "books", "offline", "people", "notifications"],\n', 1)
    open(p,"w").write(s)
    open(f"{PKG}/index.ts","w").write('// Deep imports are the norm (`@corelithzw/module-campus/students-v2`); this\n// entry carries the manifest a host composes with.\nexport { manifest } from "./manifest";\n')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-campus

The school: students and guardians, admissions, classes and subjects, the
timetable, attendance, assessments and results, fees, boarding, transport,
the library, and the parent, student and teacher portals.

```
*-v2.ts, *.ts       the domain, one file per concern, with its browser client beside it
import/             the CSV import pipeline on the kernel's import-core
fees-posting.ts     how a fee invoice, receipt or write-off posts to the books
document-sources.ts the school's document sources, registered by the host
record-types.ts     the school's record types, declared in the manifest
components/         the screens, the portals, the master-data panels
manifest.ts         id "schools"; requires records, documents, books, offline, people, notifications
```

Import by path: `import { listStudents } from "@corelithzw/module-campus/students-v2"`.

The API routes and the pages stay in the host until the Campus host composes
this module; the manifest id stays `schools`, the schema's name for it.
''')
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
