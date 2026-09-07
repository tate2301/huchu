"""Phase 2.3e: the documents module. The pipeline, renderers, template machinery and the template editor move;
document sources become a registry the host wires; the default templates become manifest data."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/documents"; PLAT=f"{ROOT}/packages/platform"; UI=f"{ROOT}/packages/ui"
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
 * A default document template a module ships: which source it prints, what
 * kind of document it is, and the layout. `schema` is the documents module's
 * template schema, carried here as plain data.
 */
export type DocumentTemplateEntry = {
  key: string;
  sourceKey: string;
  documentType: "REPORT_TABLE" | "DASHBOARD_PACK" | "SALES_INVOICE" | "SALES_QUOTATION" | "SALES_RECEIPT" | "GENERIC_RECORD";
  targetType: "LIST" | "RECORD" | "DASHBOARD";
  name: string;
  description: string;
  schema: Record<string, unknown>;
};

export type ModuleManifest = {''', 1),
        ('''  notifications?: {''', '''  documents?: {
    /** The print-ready defaults for the documents this module's sources produce. */
    templates?: readonly DocumentTemplateEntry[];
  };
  notifications?: {''', 1),
    ])
    print("kernel: manifest documents section")

GENERIC=["branding-snapshot","csv-renderer","default-template-catalog","export-client","html-renderer","pdf-renderer","sample-payloads","service","source-registry","table-exporter","template-resolver","template-schema","types"]
if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py documents records")
    os.makedirs(f"{PKG}/components/templates", exist_ok=True); os.makedirs(f"{PKG}/components/pdf", exist_ok=True)
    for f in GENERIC: sh(f'git mv "{APP}/lib/documents/{f}.ts" "{PKG}/{f}.ts"')
    sh(f'git mv "{APP}/lib/documents/hr-sources.ts" "{APP}/lib/hr/document-sources.ts"')
    sh(f'git mv "{APP}/lib/documents/hr-sources.test.ts" "{APP}/lib/hr/document-sources.test.ts"')
    sh(f'git mv "{APP}/lib/documents/schools-sources.ts" "{APP}/lib/schools/document-sources.ts"')
    sh(f'git mv "{APP}/lib/documents/schools-sources.test.ts" "{APP}/lib/schools/document-sources.test.ts"')
    assert not os.listdir(f"{APP}/lib/documents"), os.listdir(f"{APP}/lib/documents"); os.rmdir(f"{APP}/lib/documents")
    sh(f'git mv "{APP}/lib/pdf.ts" "{PKG}/pdf.ts"')
    for f in os.listdir(f"{APP}/components/pdf"): sh(f'git mv "{APP}/components/pdf/{f}" "{PKG}/components/pdf/{f}"')
    os.rmdir(f"{APP}/components/pdf")
    sh(f'git mv "{APP}/components/templates/template-library.tsx" "{PKG}/components/template-library.tsx"'); os.rmdir(f"{APP}/components/templates")
    for f in os.listdir(f"{APP}/components/crm/templates"): sh(f'git mv "{APP}/components/crm/templates/{f}" "{PKG}/components/templates/{f}"')
    os.rmdir(f"{APP}/components/crm/templates")
    for f in ["blocks","starter-templates","template-variables"]: sh(f'git mv "{APP}/lib/crm/{f}.ts" "{PKG}/{f}.ts"')
    sh(f'git mv "{APP}/components/crm/records/record-dialog.tsx" "{UI}/components/record-dialog.tsx"')
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@vercel/blob","puppeteer-core","@tanstack/react-query","@corelithzw/react"]:
        d["dependencies"][dep]=app["dependencies"][dep]
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    d["description"]="Documents: one render pipeline for everything the product prints — sources, branded templates, the template editor, PDF, HTML and CSV."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("rewrite"):
    def target(spec):
        m=re.match(r'@/lib/documents/(hr|schools)-sources$', spec)
        if m: return f"@/lib/{m.group(1)}/document-sources"
        m=re.match(r'@/lib/documents/([a-z-]+)$', spec)
        if m: return f"@corelithzw/module-documents/{m.group(1)}"
        if spec=="@/lib/pdf": return "@corelithzw/module-documents/pdf"
        m=re.match(r'@/components/pdf/(.+)$', spec)
        if m: return f"@corelithzw/module-documents/components/pdf/{m.group(1)}"
        if spec=="@/components/templates/template-library": return "@corelithzw/module-documents/components/template-library"
        m=re.match(r'@/components/crm/templates/(.+)$', spec)
        if m: return f"@corelithzw/module-documents/components/templates/{m.group(1)}"
        m=re.match(r'@/lib/crm/(blocks|starter-templates|template-variables)$', spec)
        if m: return f"@corelithzw/module-documents/{m.group(1)}"
        if spec=="@/components/crm/records/record-dialog": return "@corelithzw/ui/components/record-dialog"
        return None
    SPEC=re.compile(r'(["\'])(@/[^"\']+)\1')
    n=0
    for p in walk(APP):
        s=open(p).read()
        new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
        if new!=s: open(p,"w").write(new); n+=1
    # inside the package and ui: relative
    def relativise(base, prefix):
        c=0
        for p in walk(base):
            s=open(p).read(); d=os.path.dirname(p)
            def repl(m):
                t=target(m.group(2)) if m.group(2).startswith("@/") else m.group(2)
                if not t or not t.startswith(prefix): return m.group(0)
                rel=os.path.relpath(os.path.join(base, t[len(prefix):]), d)
                return f'{m.group(1)}{rel if rel.startswith(".") else "./"+rel}{m.group(1)}'
            pat=re.compile(r'(["\'])(@/[^"\']+|' + re.escape(prefix) + r'[^"\']+)\1')
            new=pat.sub(repl, s)
            if new!=s: open(p,"w").write(new); c+=1
        return c
    a=relativise(PKG, "@corelithzw/module-documents/"); b=relativise(UI, "@corelithzw/ui/")
    # the moved source tests import their sources by the new name
    for f, old in [(f"{APP}/lib/hr/document-sources.test.ts","./hr-sources"), (f"{APP}/lib/schools/document-sources.test.ts","./schools-sources")]:
        s=open(f).read(); s2=s.replace(f'"{old}"', '"./document-sources"'); open(f,"w").write(s2)
    print(f"rewritten app={n} package={a} ui={b}")

if want("seams"):
    # (1) document sources: a registry; the module-specific resolvers go to the host
    p=f"{PKG}/source-registry.ts"; s=open(p).read()
    a=s.index("function isoDate("); b=s.index("export async function resolveSourcePayload(")
    resolvers=s[a:b]
    s=s[:a]+s[b:]
    d0=s.index("  if (isSchoolDocumentSourceKey(input.sourceKey)) {"); d1=s.index("  switch (input.sourceKey) {")
    sw_end=s.index("\n  }\n}", d1)+len("\n  }\n}")
    switch_text=s[d1:sw_end-2]  # the switch block, without the function's closing brace
    assert s[sw_end:].strip()=="", "code follows resolveSourcePayload"
    s=s[:d0]+'''  for (const source of registeredDocumentSources()) {
    if (source.matches(input.sourceKey)) {
      return source.resolve({
        companyId,
        sourceKey: input.sourceKey,
        recordId: input.recordId,
        filters: input.filters,
      });
    }
  }

  throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
}
'''
    s=s.replace('''import {
  isSchoolDocumentSourceKey,
  resolveSchoolDocument,
} from "@/lib/documents/schools-sources";
import {
  isHrDocumentSourceKey,
  resolveHrDocumentSource,
} from "@/lib/documents/hr-sources";
''', '''import { registry } from "@corelithzw/platform/registry";
''', 1)
    assert 'import { registry }' in s
    s=s.replace('''export type SourceResolution = {''', '''/**
 * Where a document's content comes from. A source answers for the keys it
 * knows — a school's fee receipt, a payslip, an invoice — and resolves one into
 * the universal payload the renderers print. The modules that own the records
 * register theirs from the host's `modules.ts`; this file names none of them.
 */
export type DocumentSource = {
  id: string;
  matches: (sourceKey: string) => boolean;
  resolve: (input: {
    companyId: string;
    sourceKey: string;
    recordId?: string;
    filters?: Record<string, string>;
  }) => Promise<SourceResolution>;
};

const sources = registry<Map<string, DocumentSource>>("documents.sources", () => new Map());

export function registerDocumentSource(source: DocumentSource): void {
  sources.set(source.id, source);
}

export function registeredDocumentSources(): DocumentSource[] {
  return [...sources.values()];
}

export type SourceResolution = {''', 1)
    open(p,"w").write(s)
    host_src='''/**
 * The document sources this host's modules have not taken with them yet: the
 * accounting documents, the mine's shift and plant reports, the attendance
 * report and the executive dashboard. Each moves into its module when that
 * module is extracted; the pipeline they resolve into is
 * `@corelithzw/module-documents`.
 */
import { prisma } from "@corelithzw/db/client";
import type { DocumentSource, SourceResolution } from "@corelithzw/module-documents/source-registry";

'''+resolvers.rstrip("\n")+'''

export const LEGACY_DOCUMENT_SOURCE_PREFIXES = ["accounting.", "reports.", "dashboard."] as const;

export function matchesLegacyDocumentSource(sourceKey: string): boolean {
  return LEGACY_DOCUMENT_SOURCE_PREFIXES.some((prefix) => sourceKey.startsWith(prefix));
}

export const legacyDocumentSource: DocumentSource = {
  id: "legacy",
  matches: matchesLegacyDocumentSource,
  resolve: async (input) => {
    const { companyId } = input;
    '''+switch_text.replace("\n", "\n  ").rstrip()+'''
  },
};
'''
    open(f"{APP}/lib/host/document-sources.ts","w").write(host_src)
    # the host wires the three sources, importing each on first use
    edit(f"{APP}/modules.ts", [
        ('import "./manifests";\n', 'import "./manifests";\nimport { registerDocumentSource } from "@corelithzw/module-documents";\n', 1),
    ])
    s=open(f"{APP}/modules.ts").read().rstrip("\n")+'''

// Where each printable document's content comes from, by the module that owns
// the records. The school and payroll sources move with their modules.
registerDocumentSource({
  id: "schools",
  matches: (key) => key.startsWith("schools."),
  resolve: async (input) =>
    (await import("@/lib/schools/document-sources")).resolveSchoolDocument(input.companyId, input),
});
registerDocumentSource({
  id: "hr",
  matches: (key) => key.startsWith("hr."),
  resolve: async (input) => (await import("@/lib/hr/document-sources")).resolveHrDocumentSource(input),
});
registerDocumentSource({
  id: "legacy",
  matches: (key) => ["accounting.", "reports.", "dashboard."].some((prefix) => key.startsWith(prefix)),
  resolve: async (input) => (await import("@/lib/host/document-sources")).legacyDocumentSource.resolve(input),
});
'''
    open(f"{APP}/modules.ts","w").write(s)

    # (2) the default templates: the module keeps its own, the rest are manifest data
    p=f"{PKG}/default-template-catalog.ts"; s=open(p).read()
    a=s.index("export const DEFAULT_TEMPLATE_CATALOG: DefaultTemplateCatalogEntry[] = ["); b=s.index("export function resolveCatalogTemplateEntry(")
    array=s[a:b]
    entries=re.findall(r'  \{\n    key: "([^"]+)",.*?\n  \},\n', array, re.S)
    blocks=re.findall(r'(  \{\n    key: "([^"]+)",.*?\n  \},\n)', array, re.S)
    assert len(blocks)==18, len(blocks)
    own=[t for t,k in blocks if k=="ui.table.*"]; assert len(own)==1
    by_owner=collections.defaultdict(list)
    for text,key in blocks:
        if key=="ui.table.*": continue
        owner = "gold" if key in ("reports.shift","reports.plant","dashboard.executive-summary") else \
                "people" if key in ("reports.attendance","hr.payslip") else \
                "books" if key.startswith("accounting.") else \
                "schools" if key.startswith("schools.") else None
        assert owner, key
        by_owner[owner].append(text)
    s=s[:a]+'''/** The one template this module owns: a table exported from any screen. */
const OWN_TEMPLATES: DefaultTemplateCatalogEntry[] = [
'''+own[0]+'''];

/**
 * Every default template: this module's own, then what the registered
 * manifests declare (`documents.templates`), in registration order.
 */
export function defaultTemplateCatalog(): DefaultTemplateCatalogEntry[] {
  return [
    ...OWN_TEMPLATES,
    ...registeredModules().flatMap(
      (manifest) => (manifest.documents?.templates ?? []) as readonly DefaultTemplateCatalogEntry[],
    ),
  ];
}

'''+s[b:]
    s=s.replace("DEFAULT_TEMPLATE_CATALOG.find(", "defaultTemplateCatalog().find(")
    assert "DEFAULT_TEMPLATE_CATALOG" not in s, "catalog constant still referenced"
    for fn in ("mergeSchema","reportTemplate","recordTemplate","letterTemplate"):
        s=s.replace(f"function {fn}(", f"export function {fn}(", 1)
    s=s.replace('import { defaultTemplateSchema, type DocumentTemplateSchema } from "./template-schema";', 'import { registeredModules } from "@corelithzw/platform/manifest";\nimport { defaultTemplateSchema, type DocumentTemplateSchema } from "./template-schema";', 1)
    assert "registeredModules" in s
    open(p,"w").write(s)
    # the consumers read the function
    for f in [f"{APP}/components/settings/templates/template-settings-page.tsx", f"{APP}/components/settings/template-studio.tsx", f"{APP}/scripts/seed-document-templates.ts"]:
        t=open(f).read()
        t=t.replace("(typeof DEFAULT_TEMPLATE_CATALOG)[number]", "DefaultTemplateCatalogEntry")
        t=re.sub(r'\bDEFAULT_TEMPLATE_CATALOG\b(?!,|\s*\})', "defaultTemplateCatalog()", t)
        t=t.replace("  DEFAULT_TEMPLATE_CATALOG,\n", "  defaultTemplateCatalog,\n")
        t=t.replace("import { DEFAULT_TEMPLATE_CATALOG }", "import { defaultTemplateCatalog, type DefaultTemplateCatalogEntry }")
        open(f,"w").write(t)
    edit(f"{APP}/scripts/seed-document-templates.ts", [('import { defaultTemplateCatalog, type DefaultTemplateCatalogEntry }', 'import "@/manifests";\nimport { defaultTemplateCatalog, type DefaultTemplateCatalogEntry }', 1)])
    # manifests carry their templates
    helper_import='import { letterTemplate, recordTemplate, reportTemplate } from "@corelithzw/module-documents/default-template-catalog";\n'
    def add_templates(path, texts):
        t=open(path).read()
        used=[fn for fn in ("letterTemplate","recordTemplate","reportTemplate","mergeSchema") if any(fn+"(" in x for x in texts)]
        imp=f'import {{ {", ".join(sorted(used))} }} from "@corelithzw/module-documents/default-template-catalog";\n'
        t=t.replace('import type { ModuleManifest } from "@corelithzw/platform/manifest";\n', 'import type { ModuleManifest } from "@corelithzw/platform/manifest";\n'+imp, 1)
        body="".join(texts)
        assert t.rstrip().endswith("};"), path
        t=t.rstrip()[:-2].rstrip("\n")+",\n  documents: {\n    templates: [\n"+"\n".join("  "+l if l else l for l in body.rstrip("\n").split("\n"))+"\n    ],\n  },\n};\n"
        open(path,"w").write(t)
    for owner, path in [("gold", f"{APP}/lib/gold/manifest.ts"), ("people", f"{APP}/lib/people/manifest.ts"), ("schools", f"{APP}/lib/schools/manifest.ts")]:
        add_templates(path, by_owner[owner])
    open(f"{APP}/lib/accounting/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Books: the ledger, invoices, quotations, receipts, credit notes, banking,
 * fiscalisation and the financial statements.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "books",
};
''')
    add_templates(f"{APP}/lib/accounting/manifest.ts", by_owner["books"])
    edit(f"{APP}/manifests.ts", [
        ('import { manifest as records } from "@corelithzw/module-records";\n', 'import { manifest as documents } from "@corelithzw/module-documents";\nimport { manifest as records } from "@corelithzw/module-records";\n', 1),
        ('import { manifest as compliance } from "@/lib/compliance/manifest";\n', 'import { manifest as books } from "@/lib/accounting/manifest";\nimport { manifest as compliance } from "@/lib/compliance/manifest";\n', 1),
        ('registerModules([workflow, notifications, records, crm, schools, people, gold, compliance, maintenance]);\n',
         'registerModules([workflow, notifications, records, documents, books, crm, schools, people, gold, compliance, maintenance]);\n', 1),
    ])
    # the CRM declares what it now imports
    edit(f"{APP}/lib/crm/manifest.ts", [('  id: "crm",\n', '  id: "crm",\n  requires: ["records", "documents"],\n', 1)])

    # (3) package files
    open(f"{PKG}/manifest.ts","w").write('''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Documents: one render pipeline for everything the product prints. What gets
 * printed is the owning module's business — it registers a source
 * (`registerDocumentSource`) and declares its default templates in its
 * manifest (`documents.templates`).
 */
export const manifest: ModuleManifest = {
  id: "documents",
  requires: ["records"],
};
''')
    open(f"{PKG}/index.ts","w").write('''// Deep imports are the norm (`@corelithzw/module-documents/service`); this
// entry carries the manifest a host composes with and the hook it fills.
export { manifest } from "./manifest";
export { registerDocumentSource, type DocumentSource } from "./source-registry";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-documents

One render pipeline for everything the product prints.

```
service.ts                   render a document: resolve the source, pick the template, brand it, produce PDF/HTML/CSV
source-registry.ts           the universal payload, and the sources the host registered (registerDocumentSource)
template-schema.ts           what a template can say about page, header, table, footer and labels
default-template-catalog.ts  the module's own default plus what the manifests declare (documents.templates)
template-resolver.ts         which template applies: the tenant's, else the default
branding-snapshot.ts         the tenant's letterhead at render time
html-renderer.ts, pdf-renderer.ts, csv-renderer.ts
export-client.ts, table-exporter.ts, pdf.ts    the browser side: request a render, poll, download; the DataTable exporter
blocks.ts, starter-templates.ts, template-variables.ts   block templates (quotes, forms, invoices), starters, {{variables}}
components/templates/        the block editor, renderer, public form, analytics, variable picker
components/template-library  the template library screen
components/pdf/              the PDF viewer
manifest.ts                  id "documents"; requires records
```

Import by path: `import { renderDocument } from "@corelithzw/module-documents/service"`.

The module names no other module. A module with printable records registers a
source from the host's `modules.ts` and declares its default templates in its
manifest; the school, payroll, accounting and report sources live in the host
until their modules move.
''')
    print("seams done")

if want("check"):
    left=[]
    for p in list(walk(PKG))+[os.path.join(UI,"components/record-dialog.tsx")]:
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, ROOT))
    print("package files importing '@/':", left or "none")
