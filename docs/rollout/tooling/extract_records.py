"""Phase 2.3d: the records module. Record types become manifest data, search arms a registry the host wires,
the CRM's custom fields and record refs move in with the record components."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/records"; PLAT=f"{ROOT}/packages/platform"
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

if want("kernel"):
    edit(f"{PLAT}/manifest.ts", [
        ('''export type ModuleManifest = {''', '''/**
 * A record type, as its module declares it: what it is called, where its list
 * and its page are, which REST resource its attributes go to, and the query key
 * a saved attribute invalidates. `{id}` stands for the record's id. Data, so a
 * manifest can carry it; the records module turns it into the functions the
 * screens call.
 */
export type RecordTypeTemplate = {
  type: string;
  label: string;
  labelPlural: string;
  /** How the mark is drawn; one of the records module's `RecordKind`s. */
  kind: string;
  isPerson: boolean;
  indexHref: string;
  href: string;
  apiPath: string;
  queryKey: readonly string[];
};

export type ModuleManifest = {''', 1),
        ('''  notifications?: {''', '''  records?: {
    /** The record types this module owns, for the shared record page, mark and editor. */
    types?: readonly RecordTypeTemplate[];
  };
  notifications?: {''', 1),
    ])
    print("kernel: manifest records section")

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py records")
    os.makedirs(f"{PKG}/components", exist_ok=True)
    for f in ["registry.ts","search.ts","search-result.ts","subject.ts","subject.test.ts"]:
        sh(f'git mv "{APP}/lib/records/{f}" "{PKG}/{f}"')
    sh(f'git mv "{APP}/lib/records/search.test.ts" "{APP}/lib/host/records-search.test.ts"')
    os.rmdir(f"{APP}/lib/records")
    for f in sorted(os.listdir(f"{APP}/components/records")):
        sh(f'git mv "{APP}/components/records/{f}" "{PKG}/components/{f}"')
    os.rmdir(f"{APP}/components/records")
    sh(f'git mv "{APP}/lib/crm/custom-fields.ts" "{PKG}/custom-fields.ts"')
    sh(f'git mv "{APP}/lib/crm/record-ref.ts" "{PKG}/record-ref.ts"')
    # zod: custom-fields and subject validate with it
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict)
    app=json.load(open(f"{APP}/package.json"))
    d["dependencies"]["zod"]=app["dependencies"]["zod"]; d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    json.dump(d, open(p,"w"), indent=2); open(p,"a").write("\n")
    print("moved")

MAP = {  # old app specifier -> new
  "@/lib/records/registry": "@corelithzw/module-records/registry",
  "@/lib/records/search-result": "@corelithzw/module-records/search-result",
  "@/lib/records/search": "@corelithzw/module-records/search",
  "@/lib/records/subject": "@corelithzw/module-records/subject",
  "@/lib/crm/custom-fields": "@corelithzw/module-records/custom-fields",
  "@/lib/crm/record-ref": "@corelithzw/module-records/record-ref",
}
if want("rewrite"):
    comp=re.compile(r'(["\'])@/components/records/([^"\']+)\1')
    lib=re.compile(r'(["\'])(' + "|".join(re.escape(k) for k in sorted(MAP, key=len, reverse=True)) + r')\1')
    n=0
    for p in walk(APP):
        s=open(p).read()
        new=comp.sub(lambda m: f'{m.group(1)}@corelithzw/module-records/components/{m.group(2)}{m.group(1)}', s)
        new=lib.sub(lambda m: f'{m.group(1)}{MAP[m.group(2)]}{m.group(1)}', new)
        if new!=s: open(p,"w").write(new); n+=1
    # inside the package: relative
    m2=0
    for p in walk(PKG):
        s=open(p).read(); d=os.path.dirname(p)
        def rel(target):
            r=os.path.relpath(os.path.join(PKG,target), d)
            return r if r.startswith(".") else "./"+r
        new=comp.sub(lambda m: f'{m.group(1)}{rel("components/"+m.group(2))}{m.group(1)}', s)
        new=lib.sub(lambda m: f'{m.group(1)}{rel(MAP[m.group(2)].split("@corelithzw/module-records/")[1])}{m.group(1)}', new)
        if new!=s: open(p,"w").write(new); m2+=1
    print(f"rewritten app={n} package={m2}")

if want("seams"):
    # (1) the registry reads the manifests
    p=f"{PKG}/registry.ts"; s=open(p).read()
    a=s.index("const CONFIGS: RecordTypeConfig[] = ["); b=s.index("const BY_TYPE = new Map<RecordType, RecordTypeConfig>(")
    c=s.index("export const SCHOOL_RECORD_TYPES = [")
    s=s[:a]+'''function fill(template: string, id: string) {
  return template.replace(/\\{id\\}/g, id);
}

/** The templates the registered manifests declare, as the functions the screens call. */
function configs(): RecordTypeConfig[] {
  return registeredModules().flatMap((manifest) =>
    (manifest.records?.types ?? []).map((template): RecordTypeConfig => ({
      type: template.type as RecordType,
      label: template.label,
      labelPlural: template.labelPlural,
      module: manifest.id,
      kind: template.kind as RecordKind,
      isPerson: template.isPerson,
      indexHref: template.indexHref,
      href: (id) => fill(template.href, id),
      apiPath: (id) => fill(template.apiPath, id),
      queryKey: (id) => template.queryKey.map((part) => fill(part, id)),
    })),
  );
}

export function recordType(type: RecordType): RecordTypeConfig {
  const config = configs().find((candidate) => candidate.type === type);
  if (!config) throw new Error(`No record type registered as ${type}`);
  return config;
}

export function recordTypesForModule(module: string): RecordTypeConfig[] {
  return configs().filter((config) => config.module === module);
}
'''+s[c:] if False else s[:a]+'''function fill(template: string, id: string) {
  return template.replace(/\\{id\\}/g, id);
}

/** The templates the registered manifests declare, as the functions the screens call. */
function configs(): RecordTypeConfig[] {
  return registeredModules().flatMap((manifest) =>
    (manifest.records?.types ?? []).map((template): RecordTypeConfig => ({
      type: template.type as RecordType,
      label: template.label,
      labelPlural: template.labelPlural,
      module: manifest.id,
      kind: template.kind as RecordKind,
      isPerson: template.isPerson,
      indexHref: template.indexHref,
      href: (id) => fill(template.href, id),
      apiPath: (id) => fill(template.apiPath, id),
      queryKey: (id) => template.queryKey.map((part) => fill(part, id)),
    })),
  );
}

export function recordType(type: RecordType): RecordTypeConfig {
  const config = configs().find((candidate) => candidate.type === type);
  if (!config) throw new Error(`No record type registered as ${type}`);
  return config;
}

export function recordTypesForModule(module: string): RecordTypeConfig[] {
  return configs().filter((config) => config.module === module);
}
'''
    s=s.replace('import type { RecordKind } from "./components/record-mark";', 'import { registeredModules } from "@corelithzw/platform/manifest";\nimport type { RecordKind } from "./components/record-mark";', 1)
    assert 'import { registeredModules }' in s
    s=s.replace('''  /** Which module owns the tables. Governs the feature gate and the nav. */
  module: "crm" | "schools";''', '''  /** Which module owns the tables. Governs the feature gate and the nav. */
  module: string;''', 1)
    s=s.replace('''/** Every record type in the product, whichever module owns it. */
export const RECORD_TYPES = [''', '''/**
 * Every record type in the product, whichever module owns it. The vocabulary
 * is the schema's `CrmFieldEntity` enum, which modules extend in their own
 * schema files; what each type looks like and where it lives is the owning
 * module's manifest (`records.types`).
 */
export const RECORD_TYPES = [''', 1)
    open(p,"w").write(s)
    # the school list belongs to the schools module, ahead of its move
    open(f"{APP}/lib/schools/record-types.ts","w").write('''import type { RecordType } from "@corelithzw/module-records/registry";

/** The record types the school module owns; custom fields are defined against these. */
export const SCHOOL_RECORD_TYPES = [
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const satisfies readonly RecordType[];

export type SchoolRecordType = (typeof SCHOOL_RECORD_TYPES)[number];
''')
    for f in [f"{APP}/app/api/v2/schools/field-definitions/route.ts", f"{APP}/app/api/v2/schools/field-definitions/[id]/route.ts", f"{APP}/components/schools/academics/school-custom-fields-panel.tsx"]:
        s=open(f).read()
        s=re.sub(r'import \{ SCHOOL_RECORD_TYPES(, type SchoolRecordType)? \} from "@corelithzw/module-records/registry";', lambda m: f'import {{ SCHOOL_RECORD_TYPES{m.group(1) or ""} }} from "@/lib/schools/record-types";', s)
        assert '@/lib/schools/record-types' in s, f
        open(f,"w").write(s)

    # (2) search arms are a registry the host wires
    p=f"{PKG}/search.ts"; s=open(p).read()
    a=s.index('import type { Prisma } from "@corelithzw/db";'); b=s.index("export async function searchRecords(")
    s=s[:a]+'''import type { Prisma } from "@corelithzw/db";
import { registry } from "@corelithzw/platform/registry";

import { groupSearchResults, type SearchResult } from "./search-result";

type Tx = Prisma.TransactionClient;

/**
 * Which arms this caller may run, keyed by arm id: `true` for an arm that is
 * searched whole or not at all (the CRM), the permitted result types for one
 * that is filtered per type. An arm absent, `false` or given no types is not
 * called — that is what stops an unentitled type leaking through a group
 * heading or a result count. Resolved by the caller, which holds the session.
 */
export type SearchScope = Readonly<Record<string, boolean | readonly string[]>>;

export type SearchArmInput = {
  companyId: string;
  query: string;
  limitPerType?: number;
  /** The types the caller may see from this arm; empty for a whole-module arm. */
  types: readonly string[];
};

export type SearchArm = {
  id: string;
  run: (db: Tx, input: SearchArmInput) => Promise<SearchResult[]>;
};

const arms = registry<Map<string, SearchArm>>("records.search-arms", () => new Map());

/** A module's arm, registered by the host that composes it (`modules.ts`). */
export function registerSearchArm(arm: SearchArm) {
  arms.set(arm.id, arm);
}

export function registeredSearchArms(): SearchArm[] {
  return [...arms.values()];
}

'''+s[b:]
    old_body=s[s.index("  const arms: Array<Promise<SearchResult[]>> = [];"):s.index("  const results = await Promise.all(arms);")]
    s=s.replace(old_body, '''  const common = { companyId: input.companyId, query, limitPerType: input.limitPerType };

  // An arm is queued only when the caller was given it: a whole-module arm when
  // its flag is on, a typed arm when it has at least one type. Nothing else is
  // called at all.
  const runs: Array<Promise<SearchResult[]>> = [];
  for (const arm of registeredSearchArms()) {
    const granted = input.scope[arm.id];
    if (granted === true) runs.push(arm.run(db, { ...common, types: [] }));
    else if (Array.isArray(granted) && granted.length > 0) runs.push(arm.run(db, { ...common, types: granted }));
  }

''', 1)
    s=s.replace("  const results = await Promise.all(arms);", "  const results = await Promise.all(runs);", 1)
    s=s.replace(''' * Six arms now — `searchCrm`, `searchSchools`, `searchPeople`, `searchGold`,
 * `searchRetail`, `searchOperations` — which is every module that has records
 * worth typing at. That was the point of the shape: adding the gold, till and
 * plant arms touched this file for a line each, and *removing* the scrap and
 * vehicle arms with their verticals (ST-2.2, ST-2.3) cost the same. The command
 * bar, the ⌘K palette and the mention picker were not touched either way —
 * none of them knows how many modules exist.''', ''' * The arms are registered by the host that composes the modules
 * (`registerSearchArm`, from its `modules.ts`), so this file names none of
 * them: adding or removing a module touches the host's composition for a line
 * and this not at all. The command bar, the ⌘K palette and the mention picker
 * were never touched either way — none of them knows how many modules exist.''', 1)
    open(p,"w").write(s)

    # (3) the host wires the arms, lazily, and the host route's scope keeps its shape
    edit(f"{APP}/manifests.ts", [
        ('import { manifest as workflow } from "@corelithzw/module-workflow";\n',
         'import { manifest as records } from "@corelithzw/module-records";\nimport { manifest as workflow } from "@corelithzw/module-workflow";\n', 1),
        ('import { manifest as people } from "@/lib/people/manifest";\n', 'import { manifest as people } from "@/lib/people/manifest";\nimport { manifest as schools } from "@/lib/schools/manifest";\n', 1),
        ('registerModules([workflow, notifications, crm, people, gold, compliance, maintenance]);\n',
         'registerModules([workflow, notifications, records, crm, schools, people, gold, compliance, maintenance]);\n', 1),
    ])
    edit(f"{APP}/modules.ts", [('import "./manifests";\n', 'import "./manifests";\nimport { registerSearchArm } from "@corelithzw/module-records";\n', 1)])
    s=open(f"{APP}/modules.ts").read().rstrip("\n")+'''

// The search box's arms: one per module with records worth typing at.
registerSearchArm({ id: "crm", run: async (db, input) => (await import("@/lib/crm/search")).searchCrm(db, input) });
registerSearchArm({
  id: "schools",
  run: async (db, input) => {
    const { searchSchools } = await import("@/lib/schools/search");
    return searchSchools(db, { ...input, types: input.types as Parameters<typeof searchSchools>[1]["types"] });
  },
});
registerSearchArm({
  id: "people",
  run: async (db, input) => {
    const { searchPeople } = await import("@/lib/people/search");
    return searchPeople(db, { ...input, types: input.types as Parameters<typeof searchPeople>[1]["types"] });
  },
});
registerSearchArm({
  id: "gold",
  run: async (db, input) => {
    const { searchGold } = await import("@/lib/gold/search");
    return searchGold(db, { ...input, types: input.types as Parameters<typeof searchGold>[1]["types"] });
  },
});
registerSearchArm({
  id: "retail",
  run: async (db, input) => {
    const { searchRetail } = await import("@/lib/retail/search");
    return searchRetail(db, { ...input, types: input.types as Parameters<typeof searchRetail>[1]["types"] });
  },
});
registerSearchArm({
  id: "operations",
  run: async (db, input) => {
    const { searchOperations } = await import("@/lib/operations/search");
    return searchOperations(db, { ...input, types: input.types as Parameters<typeof searchOperations>[1]["types"] });
  },
});
'''
    open(f"{APP}/modules.ts","w").write(s)

    # (4) the CRM's field-definition API shape lives with custom fields; the CRM client aliases it
    p=f"{PKG}/custom-fields.ts"; s=open(p).read().rstrip("\n")+'''

/** A field definition as the API returns it, whichever module's entity it is for. */
export type FieldDefinitionRecord = {
  id: string;
  entity: string;
  key: string;
  label: string;
  description: string | null;
  type: string;
  isRequired: boolean;
  defaultValue: unknown;
  options: Array<{ value: string; label: string; colorToken?: string }> | null;
  section: string | null;
  position: number;
  showInTable: boolean;
  archivedAt: string | null;
};
'''
    open(p,"w").write(s)
    p=f"{APP}/lib/crm/crm-v2.ts"; s=open(p).read()
    a=s.index("export type CrmFieldDefinitionRecord = {"); b=s.index("};", a)+3
    s=s[:a]+'export type CrmFieldDefinitionRecord = FieldDefinitionRecord;\n'+s[b:]
    s=s.replace('import { fetchJson', 'import type { FieldDefinitionRecord } from "@corelithzw/module-records/custom-fields";\nimport { fetchJson', 1)
    assert 'FieldDefinitionRecord } from "@corelithzw/module-records/custom-fields"' in s
    open(p,"w").write(s)
    p=f"{PKG}/components/custom-field-attributes.tsx"
    edit(p, [('import type { CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";\n', 'import type { FieldDefinitionRecord as CrmFieldDefinitionRecord } from "../custom-fields";\n', 1)])

    # (5) the moved search test registers the arms it mocks
    p=f"{APP}/lib/host/records-search.test.ts"; s=open(p).read()
    s=s.replace('import { groupSearchResults, SEARCH_TYPE_ORDER } from "./search-result";\nimport { searchRecords, type SearchScope } from "./search";\n',
                'import "@/modules";\nimport { groupSearchResults, SEARCH_TYPE_ORDER } from "@corelithzw/module-records/search-result";\nimport { searchRecords, type SearchScope } from "@corelithzw/module-records/search";\n', 1)
    assert 'import "@/modules";' in s
    open(p,"w").write(s)

    # (6) manifests: the CRM's and the schools' record types
    def tmpl(t,label,plural,module,kind,person,index,href,api,qk):
        return dict(type=t,label=label,labelPlural=plural,kind=kind,isPerson=person,indexHref=index,href=href,apiPath=api,queryKey=qk)
    crm_types=[
      tmpl("PERSON","Person","People","crm","person",True,"/crm/people","/crm/people/{id}","/api/v2/crm/people/{id}",["crm","person","{id}"]),
      tmpl("COMPANY","Company","Companies","crm","company",False,"/crm/companies","/crm/companies/{id}","/api/v2/crm/companies/{id}",["crm","company","{id}"]),
      tmpl("LEAD","Lead","Leads","crm","lead",False,"/crm/leads","/crm/leads/{id}","/api/v2/crm/leads/{id}",["crm","lead","{id}"]),
      tmpl("DEAL","Deal","Deals","crm","deal",False,"/crm/deals","/crm/deals/{id}","/api/v2/crm/deals/{id}",["crm","deal","{id}"]),
      tmpl("SITE","Site","Sites","crm","site",False,"/crm/sites","/crm/sites/{id}","/api/v2/crm/sites/{id}",["crm","site","{id}"]),
      tmpl("REP","Staff member","Staff","crm","rep",True,"/crm/reps","/crm/reps/{id}","/api/v2/crm/reps/{id}",["crm","rep","{id}"]),
    ]
    school_types=[
      tmpl("STUDENT","Student","Students","schools","student",True,"/schools/students","/schools/students/{id}","/api/v2/schools/students/{id}",["schools","student","{id}"]),
      tmpl("GUARDIAN","Guardian","Guardians","schools","guardian",True,"/schools/guardians","/schools/guardians/{id}","/api/v2/schools/guardians/{id}",["schools","guardian","{id}"]),
      tmpl("TEACHER","Teacher","Teachers","schools","teacher",True,"/schools/teachers","/schools/teachers/{id}","/api/v2/schools/teachers/{id}",["schools","teacher","{id}"]),
      tmpl("CLASS","Class","Classes","schools","class",False,"/management/master-data/schools/classes","/management/master-data/schools/classes/{id}","/api/v2/schools/classes/{id}",["schools","class","{id}"]),
      tmpl("SUBJECT","Subject","Subjects","schools","subject",False,"/management/master-data/schools/subjects","/management/master-data/schools/subjects/{id}","/api/v2/schools/subjects/{id}",["schools","subject","{id}"]),
      tmpl("HOSTEL","Hostel","Hostels","schools","hostel",False,"/schools/boarding","/schools/boarding/{id}","/api/v2/schools/boarding/hostels/{id}",["schools","hostel","{id}"]),
    ]
    def ts(obj): return json.dumps(obj, indent=2, ensure_ascii=False).replace("\n","\n  ")
    edit(f"{APP}/lib/crm/manifest.ts", [
        ('''  permissions: { capabilities: CRM_CAPABILITY_SET },
};''', '''  permissions: { capabilities: CRM_CAPABILITY_SET },
  records: {
    // The academic ladder's records moved under Management > Master Data; the
    // CRM's stay where they were.
    types: '''+ts(crm_types)+''',
  },
};''', 1)])
    open(f"{APP}/lib/schools/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Campus: the school — pupils, guardians, teachers, the academic ladder,
 * boarding, fees and the portals.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "schools",
  records: {
    // The academic ladder (classes, subjects) moved under Management > Master
    // Data; the old `/schools/classes` routes still redirect there.
    types: '''+ts(school_types)+''',
  },
};
''')
    open(f"{PKG}/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Records: the shared record page, mark, attribute editor and custom fields,
 * the subject of a task, comment or file, and the one search box. Every module
 * with records declares them in its own manifest (`records.types`) and hands
 * the host a search arm; this module owns none of them.
 */
export const manifest: ModuleManifest = {
  id: "records",
};
''')
    open(f"{PKG}/index.ts","w").write('''// Deep imports are the norm (`@corelithzw/module-records/registry`); this entry
// carries the manifest a host composes with and the hook it fills.
export { manifest } from "./manifest";
export { registerSearchArm, type SearchArm, type SearchArmInput, type SearchScope } from "./search";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-records

What every record in the product has in common, whichever module owns it.

```
registry.ts        the record types the registered manifests declare, as the functions the screens call
subject.ts         the subject of a task, comment or file: (type, id) across modules
search.ts          one search across the arms the host registered (registerSearchArm)
search-result.ts   the shared result shape, grouping and labels
custom-fields.ts   custom-field definitions and values; the field-definition API shape
record-ref.ts      parsing a record's href back into a reference
components/        record page shell, mark, attributes, table, peek, trail, entity link, …
manifest.ts        id "records"; requires nothing
```

Import by path: `import { recordType } from "@corelithzw/module-records/registry"`.

The module names no other module. A module with records declares them in its
manifest (`records.types`, templates with `{id}`); the host wires each module's
search arm in its `modules.ts`. The vocabulary of types is the schema's
`CrmFieldEntity` enum, which modules extend in their own schema files.
''')
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
