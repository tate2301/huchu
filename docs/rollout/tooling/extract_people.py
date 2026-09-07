"""Phase 2.3h: the people module — lib/hr, lib/people, lib/payroll, payroll-periods and their components."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/people"; UI=f"{ROOT}/packages/ui"
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

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py people books,workflow,documents,records")
    for d in ["hr","people","payroll","components/people","components/payroll"]: os.makedirs(f"{PKG}/{d}", exist_ok=True)
    # tests that read the host go to lib/host; the old boundary test is superseded by the package's
    sh(f'git rm -q "{APP}/lib/hr/module-boundary.test.ts"')
    sh(f'git mv "{APP}/lib/hr/route-guard-coverage.test.ts" "{APP}/lib/host/hr-route-guard-coverage.test.ts"')
    sh(f'git mv "{APP}/lib/hr/productisation.test.ts" "{APP}/lib/host/hr-productisation.test.ts"')
    def move_tree(src, dst):
        for dp,dn,fn in os.walk(src):
            rel=os.path.relpath(dp, src); os.makedirs(os.path.join(dst, rel) if rel!="." else dst, exist_ok=True)
            for f in fn: sh(f'git mv "{os.path.join(dp,f)}" "{os.path.join(dst, rel, f) if rel!="." else os.path.join(dst,f)}"')
        sh(f'rm -rf "{src}"')
    move_tree(f"{APP}/lib/hr", f"{PKG}/hr")
    if os.path.exists(f"{PKG}/manifest.ts"): os.remove(f"{PKG}/manifest.ts")
    sh(f'git mv "{APP}/lib/people/manifest.ts" "{PKG}/manifest.ts"')
    move_tree(f"{APP}/lib/people", f"{PKG}/people")
    move_tree(f"{APP}/lib/payroll", f"{PKG}/payroll")
    sh(f'git mv "{APP}/lib/payroll-periods.ts" "{PKG}/payroll-periods.ts"')
    move_tree(f"{APP}/components/people", f"{PKG}/components/people")
    move_tree(f"{APP}/components/payroll", f"{PKG}/components/payroll")
    sh(f'git mv "{APP}/components/schools/common/person-avatar.tsx" "{UI}/components/person-avatar.tsx"')
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@tanstack/react-query","@corelithzw/react","date-fns"]:
        if dep in app["dependencies"]: d["dependencies"][dep]=app["dependencies"][dep]
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    d["description"]="People: employees, leave, attendance, payroll runs, statutory tables and returns, disbursements, compensation and disciplinary actions. Exports the directory every other module reads."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

MAP=[("@/lib/hr/","@corelithzw/module-people/hr/"),("@/lib/people/","@corelithzw/module-people/people/"),("@/lib/payroll/","@corelithzw/module-people/payroll/"),
     ("@/lib/payroll-periods","@corelithzw/module-people/payroll-periods"),("@/components/people/","@corelithzw/module-people/components/people/"),
     ("@/components/payroll/","@corelithzw/module-people/components/payroll/"),("@/components/schools/common/person-avatar","@corelithzw/ui/components/person-avatar")]
def target(spec):
    for old,new in MAP:
        if spec==old.rstrip("/") or (old.endswith("/") and spec.startswith(old)): return new+spec[len(old):] if old.endswith("/") else new
    return None
if want("client"):
    header='''/** The people screens' client: what the browser asks of `/api/employees` and friends. */
import { buildQuery, fetchJson, type Pagination } from "@corelithzw/platform/api-client";
import type { EmployeePositionValue } from "@corelithzw/platform/vertical-defaults";

'''
    open(f"{SCRATCH}/people-client-header.txt","w").write(header)
    sh(f'python3 {SCRATCH}/apislice.py "{PKG}/api-client.ts" "{SCRATCH}/people-client-header.txt" "PeriodPurpose,EmployeeModuleValue,EmployeeSummary,ShiftGroupRecord,ShiftGroupMemberRecord,ShiftGroupScheduleRecord,DepartmentRecord,JobGradeRecord,CompensationProfileRecord,CompensationRuleRecord,CompensationTemplateRecord,PayrollConfigRecord,PayrollPeriodRecord,PayrollRunRecord,DisbursementBatchRecord,EmployeePayment,AttendanceRecord,HrIncidentRecord,DisciplinaryActionRecord,LinkableUser,fetchLinkableUsers,fetchEmployees,fetchShiftGroups,fetchShiftGroup,createShiftGroup,updateShiftGroup,archiveShiftGroup,permanentlyDeleteShiftGroup,fetchShiftGroupMembers,addShiftGroupMembers,updateShiftGroupMember,removeShiftGroupMember,fetchShiftGroupSchedules,createShiftGroupSchedule,updateShiftGroupSchedule,deleteShiftGroupSchedule,fetchDepartments,createDepartment,updateDepartment,deleteDepartment,fetchJobGrades,createJobGrade,updateJobGrade,deleteJobGrade,fetchCompensationProfiles,fetchCompensationRules,fetchCompensationTemplates,fetchPayrollPeriods,fetchPayrollRuns,fetchDisbursementBatches,fetchPayrollConfig,updatePayrollConfig,fetchEmployeePayments,fetchAttendance,fetchHrIncidents,fetchDisciplinaryActions" "@corelithzw/module-people/api-client"')
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
            if not t or not t.startswith("@corelithzw/module-people/"): return f'{mm.group(1)}{t or mm.group(2)}{mm.group(1)}'
            r=os.path.relpath(os.path.join(PKG, t[len("@corelithzw/module-people/"):]), d)
            return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
        new=re.compile(r'(["\'])(@/[^"\']+|@corelithzw/module-people/[^"\']+)\1').sub(repl, s)
        new=new.replace('from "@/lib/api"', 'from "../../api-client"') if "/components/" in p else new
        if new!=s: open(p,"w").write(new); m+=1
    u=0
    for p in walk(UI):
        s=open(p).read(); new=re.sub(r'(["\'])@corelithzw/ui/([^"\']+)\1', lambda mm: (lambda r: f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}')(os.path.relpath(os.path.join(UI,mm.group(2)), os.path.dirname(p))), s)
        if new!=s: open(p,"w").write(new); u+=1
    print(f"rewritten app={n} package={m} ui={u}")

if want("seams"):
    p=f"{PKG}/manifest.ts"; s=open(p).read()
    s=s.replace(''' *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */''', ''' * Data only.
 */''')
    s=s.replace('  id: "people",\n', '  id: "people",\n  requires: ["books", "workflow", "documents", "records"],\n', 1)
    open(p,"w").write(s)
    open(f"{PKG}/index.ts","w").write('''// Deep imports are the norm (`@corelithzw/module-people/hr/permissions`); this
// entry carries the manifest a host composes with and the directory other
// modules read.
export { manifest } from "./manifest";
export * as directory from "./directory";
''')
    open(f"{PKG}/directory.ts","w").write('''/**
 * The directory: what another module may know about the people who work here.
 *
 * Campus links a teacher, Stock issues to a storeman, Gold pays a crew. They
 * read employees through this subpath and nothing else of this module; the
 * plan names it `directory` for that reason. It starts with the search arm's
 * result shape and the linkable-user client and grows as the readers arrive.
 */
export {
  fetchDisciplinaryActions,
  fetchEmployees,
  fetchHrIncidents,
  fetchLinkableUsers,
  fetchShiftGroup,
  fetchShiftGroupMembers,
  fetchShiftGroupSchedules,
  fetchShiftGroups,
  type DisciplinaryActionRecord,
  type EmployeeModuleValue,
  type EmployeeSummary,
  type HrIncidentRecord,
  type LinkableUser,
  type ShiftGroupMemberRecord,
  type ShiftGroupRecord,
  type ShiftGroupScheduleRecord,
} from "./api-client";
export { PEOPLE_SEARCH_FEATURES, PEOPLE_SEARCH_RESOURCES, PEOPLE_SEARCH_TYPES, searchPeople, type PeopleSearchType } from "./people/search";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-people

Employees, leave, attendance, payroll runs, statutory tables and returns,
disbursements, compensation and disciplinary actions.

```
hr/            permissions, bootstrap, the payroll engine and its posting, statutory packs, returns, the payslip source
people/        attendance, leave, search, the tabs
payroll/       disbursements, the tabs
payroll-periods.ts
api-client.ts  the browser's client for the people endpoints
directory.ts   what another module may read: the search arm and the linkable users
components/    the people and payroll shells, the employee wizard, leave, statutory screens
manifest.ts    id "people"; requires books, workflow, documents, records
```

Import by path: `import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions"`.

Other modules read people through `@corelithzw/module-people/directory` and
nothing else of this module.
''')
    edit(f"{APP}/manifests.ts", [('import { manifest as people } from "@/lib/people/manifest";\n', 'import { manifest as people } from "@corelithzw/module-people/manifest";\n', 1)])
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
