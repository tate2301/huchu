"""Phase 2.3g: the books module. lib/accounting and components/accounting move; the fiscal drain's school issuer and
backlog alert become hooks the host wires; the accounting API client leaves lib/api.ts; the kernel gets its own
browser client (sites, ids) and the reserved-id hook; the report table goes to ui."""
import os, re, subprocess, sys, json, collections
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; PKG=f"{ROOT}/packages/modules/books"; PLAT=f"{ROOT}/packages/platform"; UI=f"{ROOT}/packages/ui"
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
    # the kernel's own browser clients, and the hook that reserves an id
    os.makedirs(f"{PLAT}/client", exist_ok=True); os.makedirs(f"{PLAT}/hooks", exist_ok=True)
    api=open(f"{APP}/lib/api.ts").read()
    def block(name):
        m=re.search(r'^export (?:async function|type) '+re.escape(name)+r'\b', api, re.M); s=m.start()
        if m.group(0).startswith("export type"):
            depth=0;k=m.end()
            while True:
                c=api[k]
                if c in "{[(": depth+=1
                elif c in "}])": depth-=1
                elif c==";" and depth==0: break
                k+=1
            return s,k+1
        j=api.index("{", m.end()); depth=0;k=j
        while True:
            c=api[k]
            if c=="{": depth+=1
            elif c=="}":
                depth-=1
                if depth==0: break
            k+=1
        return s,k+1
    pieces={n:api[block(n)[0]:block(n)[1]] for n in ["Site","fetchSites","ReserveIdEntity","reserveEntityId"]}
    open(f"{PLAT}/client/sites.ts","w").write('/** The browser\'s client for the kernel\'s sites. */\nimport { fetchJson } from "../api-client";\n\n'+pieces["Site"]+"\n\n"+pieces["fetchSites"]+"\n")
    open(f"{PLAT}/client/ids.ts","w").write('/** Reserve the next document or record number for an entity, from the kernel\'s id service. */\nimport { fetchJson } from "../api-client";\n\n'+pieces["ReserveIdEntity"]+"\n\n"+pieces["reserveEntityId"]+"\n")
    for n in ["Site","fetchSites","ReserveIdEntity","reserveEntityId"]:
        s,e=block(n); api=api[:s]+api[e:]
    api=api.replace('export type { Pagination, PaginationMeta } from "@corelithzw/platform/api-client";\n',
        'export type { Pagination, PaginationMeta } from "@corelithzw/platform/api-client";\nexport { fetchSites, type Site } from "@corelithzw/platform/client/sites";\nexport { reserveEntityId, type ReserveIdEntity } from "@corelithzw/platform/client/ids";\n', 1)
    api=api.replace('import type { UserRole } from "@corelithzw/platform/roles";\n', 'import type { UserRole } from "@corelithzw/platform/roles";\nimport type { Site } from "@corelithzw/platform/client/sites";\n', 1)
    api=re.sub(r'\n{3,}', "\n\n", api)
    open(f"{APP}/lib/api.ts","w").write(api)
    sh(f'git mv "{APP}/hooks/use-reserved-id.ts" "{PLAT}/hooks/use-reserved-id.ts"')
    edit(f"{PLAT}/hooks/use-reserved-id.ts", [
        ('import { reserveEntityId, type ReserveIdEntity } from "@/lib/api";\nimport { getApiErrorMessage } from "@corelithzw/platform/api-client";\n',
         'import { getApiErrorMessage } from "../api-client";\nimport { reserveEntityId, type ReserveIdEntity } from "../client/ids";\n', 1)])
    # the report table is domain-free furniture
    sh(f'git mv "{APP}/components/accounting/report-table.tsx" "{UI}/components/report-table.tsx"')
    n=0
    for p in walk(APP):
        s=open(p).read()
        new=s.replace('"@/hooks/use-reserved-id"', '"@corelithzw/platform/hooks/use-reserved-id"').replace('"@/components/accounting/report-table"', '"@corelithzw/ui/components/report-table"')
        if new!=s: open(p,"w").write(new); n+=1
    for p in walk(UI):
        s=open(p).read(); new=re.sub(r'(["\'])@corelithzw/ui/([^"\']+)\1', lambda m: f'{m.group(1)}{os.path.relpath(os.path.join(UI,m.group(2)), os.path.dirname(p)) if os.path.relpath(os.path.join(UI,m.group(2)), os.path.dirname(p)).startswith(".") else "./"+os.path.relpath(os.path.join(UI,m.group(2)), os.path.dirname(p))}{m.group(1)}', s)
        if new!=s: open(p,"w").write(new)
    print(f"kernel: client/sites, client/ids, hooks/use-reserved-id; report-table to ui; {n} app files rewritten")

if want("move"):
    sh(f"python3 {SCRATCH}/new_module.py books documents,notifications")
    os.makedirs(f"{PKG}/components", exist_ok=True)
    for f in sorted(os.listdir(f"{APP}/lib/accounting")): sh(f'git mv "{APP}/lib/accounting/{f}" "{PKG}/{f}"')
    for f in sorted(os.listdir(f"{APP}/components/accounting")): sh(f'git mv "{APP}/components/accounting/{f}" "{PKG}/components/{f}"')
    for d in (f"{APP}/lib/accounting", f"{APP}/components/accounting"):
        if os.path.isdir(d) and not os.listdir(d): os.rmdir(d)
    # the books manifest, written ahead of the move in 2.3e, comes home
    if os.path.exists(f"{APP}/lib/accounting/manifest.ts"): sh(f'git mv "{APP}/lib/accounting/manifest.ts" "{PKG}/manifest.ts"')
    p=f"{PKG}/package.json"; d=json.load(open(p), object_pairs_hook=collections.OrderedDict); app=json.load(open(f"{APP}/package.json"))
    for dep in ["zod","@tanstack/react-query","@corelithzw/react","date-fns"]:
        if dep in app["dependencies"]: d["dependencies"][dep]=app["dependencies"][dep]
    d["dependencies"]=collections.OrderedDict(sorted(d["dependencies"].items()))
    d["description"]="Books: the ledger, invoices, quotations, receipts, credit notes, purchases, banking, fiscalisation and the financial statements."
    json.dump(d, open(p,"w"), indent=2, ensure_ascii=False); open(p,"a").write("\n")
    print("moved")

if want("client"):
    api=open(f"{APP}/lib/api.ts").read()
    names=[]
    for m in re.finditer(r'^export (?:async function|type|interface) ([A-Za-z]+)', api, re.M):
        n=m.group(1)
        if re.search(r'(Accounting|Journal|Invoice|CostCenter|Currency|ArAging|ApAging|Financial|Ledger|Bank|Receivable|Payable|PostingRule|PostingSimulation|TrialBalance|Purchase|Sales|CreditNote|Fiscal|TaxCode|ChartOfAccount|TenderAccount|Receipt)', n) \
           and not re.search(r'(Payroll|Gold|Buyer|Retail|Employee|School|Crm|Site\b)', n):
            names.append(n)
    header='''/**
 * The books screens' client: what the browser asks of `/api/accounting`.
 */
import { buildQuery, fetchJson, type Pagination, type PaginationMeta } from "@corelithzw/platform/api-client";
import type { Site } from "@corelithzw/platform/client/sites";

'''
    open(f"{SCRATCH}/books-client-header.txt","w").write(header)
    sh(f'python3 {SCRATCH}/apislice.py "{PKG}/api-client.ts" "{SCRATCH}/books-client-header.txt" "{",".join(names)}" "@corelithzw/module-books/api-client"')
    print("client: sliced", len(names), "exports")

if want("rewrite"):
    n=0
    for p in walk(APP):
        s=open(p).read()
        new=re.sub(r'(["\'])@/lib/accounting/([^"\']+)\1', lambda m: f'{m.group(1)}@corelithzw/module-books/{m.group(2)}{m.group(1)}', s)
        new=re.sub(r'(["\'])@/components/accounting/([^"\']+)\1', lambda m: f'{m.group(1)}@corelithzw/module-books/components/{m.group(2)}{m.group(1)}', new)
        if new!=s: open(p,"w").write(new); n+=1
    m=0
    for p in walk(PKG):
        s=open(p).read(); d=os.path.dirname(p)
        def rel(t):
            r=os.path.relpath(os.path.join(PKG,t), d); return r if r.startswith(".") else "./"+r
        new=re.sub(r'(["\'])@/lib/accounting/([^"\']+)\1', lambda mm: f'{mm.group(1)}{rel(mm.group(2))}{mm.group(1)}', s)
        new=re.sub(r'(["\'])@/components/accounting/([^"\']+)\1', lambda mm: f'{mm.group(1)}{rel("components/"+mm.group(2))}{mm.group(1)}', new)
        new=re.sub(r'(["\'])@corelithzw/module-books/([^"\']+)\1', lambda mm: f'{mm.group(1)}{rel(mm.group(2))}{mm.group(1)}', new)
        # the components' client calls go to the module's own client; lib/api.ts names that stayed there are host-only
        new=new.replace('from "@/lib/api"', 'from "./api-client"') if "/components/" not in p else new
        if new!=s: open(p,"w").write(new); m+=1
    print(f"rewritten app={n} package={m}")

if want("seams"):
    p=f"{PKG}/fiscal-drain.ts"
    edit(p, [
        ('import { issueSchoolFeeReceiptFiscalisation } from "@/lib/schools/fiscalisation";\nimport { emitIncidentNotification } from "@/lib/notifications";\n',
         'import { registry } from "@corelithzw/platform/registry";\n', 1),
        ('''export const defaultFiscalDrainIssuers: FiscalDrainIssuers = {
  salesInvoice: async ({ companyId, invoiceId }) => {
    const result = await issueFiscalReceipt(companyId, invoiceId, DRAIN_ACTOR_ID);
    return { status: result.status, error: result.error ?? null };
  },
  schoolFeeReceipt: async ({ companyId, receiptId }) => {
    const result = await issueSchoolFeeReceiptFiscalisation({ companyId, receiptId });
    return { status: result.fiscalStatus, error: result.fiscalError ?? null };
  },
};
''', '''/**
 * The issuers the host registered for the receipts another module writes —
 * a school's fee receipt is the first — keyed the way `FiscalDrainIssuers`
 * names them. Books issues its own invoices; it never imports a school.
 */
const registeredIssuers = registry<Partial<Omit<FiscalDrainIssuers, "salesInvoice">>>(
  "books.fiscal-drain-issuers",
  () => ({}),
);

export function registerFiscalDrainIssuer<K extends keyof Omit<FiscalDrainIssuers, "salesInvoice">>(
  kind: K,
  issuer: FiscalDrainIssuers[K],
): void {
  registeredIssuers[kind] = issuer;
}

export const defaultFiscalDrainIssuers: FiscalDrainIssuers = {
  salesInvoice: async ({ companyId, invoiceId }) => {
    const result = await issueFiscalReceipt(companyId, invoiceId, DRAIN_ACTOR_ID);
    return { status: result.status, error: result.error ?? null };
  },
  schoolFeeReceipt: async (args) => {
    const issuer = registeredIssuers.schoolFeeReceipt;
    if (!issuer) {
      throw new Error("No fiscal issuer registered for school fee receipts: the host must call registerFiscalDrainIssuer(\\"schoolFeeReceipt\\", …) in modules.ts.");
    }
    return issuer(args);
  },
};

/**
 * What the drain says when a tenant's receipts have been stuck for a while.
 * Raising the incident is the compliance module's business; the host wires
 * its emitter here (`onFiscalBacklog`), and the drain only describes it.
 */
export type FiscalBacklogEvent = {
  companyId: string;
  actorId: string;
  incidentId: string;
  title: string;
};

const backlogListeners = registry<Set<(event: FiscalBacklogEvent) => Promise<unknown>>>(
  "books.fiscal-backlog-listeners",
  () => new Set(),
);

export function onFiscalBacklog(listener: (event: FiscalBacklogEvent) => Promise<unknown>): void {
  backlogListeners.add(listener);
}
''', 1),
        ('''  await emitIncidentNotification(prisma, {
    companyId: args.companyId,
    actorId: DRAIN_ACTOR_ID,
    event: "CREATED",
    incident: {
      id: entityId,
      incidentType: `Fiscalisation backlog: ${stuck} receipt${stuck === 1 ? "" : "s"} unsent, oldest ${oldestMinutes}m`,
      severity: "CRITICAL",
      status: "OPEN",
      site: { name: "Fiscalisation", code: "fiscalisation" },
    },
  });
''', '''  const event: FiscalBacklogEvent = {
    companyId: args.companyId,
    actorId: DRAIN_ACTOR_ID,
    incidentId: entityId,
    title: `Fiscalisation backlog: ${stuck} receipt${stuck === 1 ? "" : "s"} unsent, oldest ${oldestMinutes}m`,
  };
  for (const listener of backlogListeners) {
    await listener(event);
  }
''', 1),
    ])
    # the host wires both
    edit(f"{APP}/modules.ts", [
        ('import "./manifests";\n', 'import "./manifests";\nimport { onFiscalBacklog, registerFiscalDrainIssuer } from "@corelithzw/module-books";\n', 1),
    ])
    s=open(f"{APP}/modules.ts").read().rstrip("\n")+'''

// The fiscal drain re-issues receipts other modules write, and raises an
// incident when a tenant is stuck. The school's issuer and the compliance
// module's incident live with their modules.
registerFiscalDrainIssuer("schoolFeeReceipt", async (args) => {
  const { issueSchoolFeeReceiptFiscalisation } = await import("@/lib/schools/fiscalisation");
  const result = await issueSchoolFeeReceiptFiscalisation(args);
  return { status: result.fiscalStatus, error: result.fiscalError ?? null };
});
onFiscalBacklog(async (event) => {
  const [{ emitIncidentNotification }, { prisma }] = await Promise.all([
    import("@/lib/notifications"),
    import("@corelithzw/db/client"),
  ]);
  await emitIncidentNotification(prisma, {
    companyId: event.companyId,
    actorId: event.actorId,
    event: "CREATED",
    incident: {
      id: event.incidentId,
      incidentType: event.title,
      severity: "CRITICAL",
      status: "OPEN",
      site: { name: "Fiscalisation", code: "fiscalisation" },
    },
  });
});
'''
    open(f"{APP}/modules.ts","w").write(s)
    # manifest and entry
    p=f"{PKG}/manifest.ts"; s=open(p).read()
    s=s.replace('''/**
 * Books: the ledger, invoices, quotations, receipts, credit notes, banking,
 * fiscalisation and the financial statements.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */''', '''/**
 * Books: the ledger, invoices, quotations, receipts, credit notes, purchases,
 * banking, fiscalisation and the financial statements. Data only.
 */''')
    s=s.replace('  id: "books",\n', '  id: "books",\n  requires: ["documents", "notifications"],\n', 1)
    open(p,"w").write(s)
    open(f"{PKG}/index.ts","w").write('''// Deep imports are the norm (`@corelithzw/module-books/posting`); this entry
// carries the manifest a host composes with and the hooks it fills.
export { manifest } from "./manifest";
export { onFiscalBacklog, registerFiscalDrainIssuer, type FiscalBacklogEvent } from "./fiscal-drain";
''')
    open(f"{PKG}/README.md","w").write('''# @corelithzw/module-books

The ledger and everything that posts to it.

```
chart-of-accounts, ledger, balances, posting, closing, period-lock, ownership   the books themselves
defaults, source-types, bootstrap, tax-rules, tax-selection, vat-return         what a tenant starts with, and tax
fiscalisation, fiscal-day, fiscal-drain, fdms-*, integration*                    ZIMRA fiscalisation and the device
payment-ledger, retail-posting, listview-*, format, tab-config, visibility       the rest of the domain
api-client.ts                    the browser's client for /api/accounting
components/                      the accounting shell, hubs, list views, fiscalisation and tax screens
manifest.ts                      id "books"; requires documents, notifications
```

Import by path: `import { createJournalEntryFromSource } from "@corelithzw/module-books/posting"`.

Two hooks the host fills from its `modules.ts`: `registerFiscalDrainIssuer`
for the receipts another module writes (the school's fee receipt), and
`onFiscalBacklog` for what happens when a tenant's receipts have been stuck
for a while (the compliance module raises an incident). Books names neither.
''')
    edit(f"{APP}/manifests.ts", [
        ('import { manifest as books } from "@/lib/accounting/manifest";\n', 'import { manifest as books } from "@corelithzw/module-books";\n', 1),
    ])
    print("seams done")

if want("check"):
    left=[]
    for p in walk(PKG):
        if re.search(r'["\']@/', open(p).read()): left.append(os.path.relpath(p, PKG))
    print("package files importing '@/':", left or "none")
