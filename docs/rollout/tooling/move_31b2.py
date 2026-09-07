#!/usr/bin/env python3
"""3.1b-2: the shared modules' route handlers and pages into their packages; the legacy host composed from all of them.
Steps: plan seams move rewrite compose deps check (default: all). Text seams run before any file moves."""
import os, re, json, subprocess, sys, pathlib
ROOT = "/home/user/huchu"; APP = f"{ROOT}/apps/legacy"; PK = f"{ROOT}/packages"; MOD = f"{PK}/modules"
S = "/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad"
steps = sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def read(p): return open(p).read()
def write(p, s): os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(s)
def edit(p, old, new, count=1):
    s = read(p); n = s.count(old)
    assert n == count, f"{os.path.relpath(p, ROOT)}: expected {count} of {old[:70]!r}, found {n}"
    write(p, s.replace(old, new))
def walk(base, exts=(".ts", ".tsx")):
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in ("node_modules", ".next", ".turbo")]
        for f in fn:
            if f.endswith(exts): yield os.path.join(dp, f)
def move_tree(src, dst):
    if not os.path.exists(src):
        assert os.path.exists(dst), f"neither {src} nor {dst} exists"; return
    if os.path.isfile(src):
        os.makedirs(os.path.dirname(dst), exist_ok=True); sh(f'git mv "{src}" "{dst}"'); return
    for dp, dn, fn in os.walk(src):
        rel = os.path.relpath(dp, src); target = os.path.join(dst, rel) if rel != "." else dst
        os.makedirs(target, exist_ok=True)
        for f in fn: sh(f'git mv "{os.path.join(dp, f)}" "{os.path.join(target, f)}"')
    sh(f'rm -rf "{src}"')

API_MOVES = {
    "books": ["api/accounting"],
    "gold": ["api/gold", "api/settlements", "api/shift-reports", "api/plant-reports", "api/sections", "api/downtime-codes", "api/analytics"],
    "maintenance": ["api/equipment", "api/work-orders"],
    "people": ["api/payroll", "api/compensation", "api/people", "api/hr", "api/disbursements", "api/employees", "api/adjustments",
               "api/employee-payments", "api/job-grades", "api/departments", "api/approvals"],
    "compliance": ["api/compliance"],
    "notifications": ["api/notifications"],
    "documents": ["api/document-templates", "api/documents"],
    "stock": ["api/inventory", "api/stock-locations", "api/v2/inventory"],
    "sell": ["api/v2/retail", "api/v2/pos"],
    "crm": ["api/v2/crm", "api/public/crm"],
    "records": ["api/v2/records/files", "api/v2/records/comments"],
}
PAGE_MOVES = {
    "books": ["accounting"],
    "gold": ["gold", "shift-report", "plant-report", "reports/downtime", "reports/gold-chain", "reports/gold-receipts", "reports/plant",
             "reports/shift", "management/master-data/operations/downtime-codes", "management/master-data/operations/sections",
             "management/master-data/operations/gold-expense-types"],
    "maintenance": ["maintenance", "reports/maintenance-equipment", "reports/maintenance-work-orders"],
    "people": ["people", "payroll", "reports/attendance", "management/master-data/hr"],
    "compliance": ["compliance", "reports/compliance-incidents"],
    "documents": ["templates", "preferences/organization/templates"],
    "stock": ["stores", "reports/stores-movements", "reports/fuel-ledger"],
    "sell": ["retail", "portal/pos"],
    "crm": ["crm", "v", "s", "f", "a"],
    "offline": ["offline"],
    "campus": ["management/master-data/schools"],
}
EXTRA_REQUIRES = {"maintenance": ["books"], "stock": ["books", "documents"]}
MODULES = sorted(set(API_MOVES) | set(PAGE_MOVES))

def moving_files():
    for mod, dirs in API_MOVES.items():
        for d in dirs: yield from walk(f"{APP}/app/{d}")
    for mod, dirs in PAGE_MOVES.items():
        for d in dirs: yield from walk(f"{APP}/app/{d}")

if want("plan"):
    for d in [x for v in API_MOVES.values() for x in v] + [x for v in PAGE_MOVES.values() for x in v]:
        assert os.path.exists(f"{APP}/app/{d}"), d
    n = sum(1 for _ in moving_files()); print("files to move:", n)
    others = sorted({m.group(1) for p in moving_files() for m in re.finditer(r'from "(@/[^"]+)"', read(p))})
    print("host paths imported by moving files:", others)

if want("seams"):
    # 1. a page or route in a package reads the session through the kernel
    n = 0
    for p in moving_files():
        s = read(p)
        if "authOptions" not in s: continue
        new = s.replace("getServerSession(authOptions)", "getCurrentAuthSession()")
        new = re.sub(r'import \{ authOptions \} from "@/lib/auth";?\n', "", new)
        if "getServerSession" not in new.replace("import { getServerSession }", ""):
            new = re.sub(r'import \{ getServerSession \} from "next-auth";?\n', 'import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";\n', new)
        else:
            new = new.replace('import { getServerSession } from "next-auth";', 'import { getServerSession } from "next-auth";\nimport { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";')
        assert "authOptions" not in new, p
        write(p, new); n += 1
    print("session seam:", n)

    # 2. books tells the CRM through a hook, never by name
    write(f"{MOD}/books/sales-hooks.ts", '''/**
 * What the books announce when a sales document is raised, for the modules
 * downstream of the money. The CRM listens (a quote it produced was invoiced
 * in the books; a payment against an invoice it owns closes the record) —
 * registered by the host that composes both (`onSalesInvoiceCreated`,
 * `onSalesReceiptCreated` from its `modules.ts`). The books name no listener.
 *
 * A listener never fails the request that raised the document: the invoice is
 * already real either way, so a failure is logged and the rest still run.
 */
import { registry } from "@corelithzw/platform/registry";

export type SalesInvoiceCreatedEvent = { companyId: string; invoiceId: string; userId: string };
export type SalesReceiptCreatedEvent = { companyId: string; receiptId: string; invoiceId: string | null; userId: string };

const invoiceListeners = registry<Set<(event: SalesInvoiceCreatedEvent) => Promise<void>>>("books.sales-invoice-created", () => new Set());
const receiptListeners = registry<Set<(event: SalesReceiptCreatedEvent) => Promise<void>>>("books.sales-receipt-created", () => new Set());

export function onSalesInvoiceCreated(listener: (event: SalesInvoiceCreatedEvent) => Promise<void>): void {
  invoiceListeners.add(listener);
}

export function onSalesReceiptCreated(listener: (event: SalesReceiptCreatedEvent) => Promise<void>): void {
  receiptListeners.add(listener);
}

async function tell<T>(listeners: Set<(event: T) => Promise<void>>, event: T, what: string) {
  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (error) {
      console.error(`[Books] A listener for ${what} failed:`, error);
    }
  }
}

export function emitSalesInvoiceCreated(event: SalesInvoiceCreatedEvent): Promise<void> {
  return tell(invoiceListeners, event, "a sales invoice");
}

export function emitSalesReceiptCreated(event: SalesReceiptCreatedEvent): Promise<void> {
  return tell(receiptListeners, event, "a receipt");
}
''')
    p = f"{APP}/app/api/accounting/sales/invoices/route.ts"
    edit(p, 'import { onAccountingInvoiceCreated } from "@corelithzw/module-crm/accounting-hooks";\n', 'import { emitSalesInvoiceCreated } from "@corelithzw/module-books/sales-hooks";\n')
    edit(p, "    // If this came off a CRM quote, let the CRM know its work has been\n    // invoiced. Never throws — the invoice is already real either way.\n    await onAccountingInvoiceCreated({",
            "    // If this came off a CRM quote, the CRM (listening through the host)\n    // learns its work has been invoiced. Never throws — the invoice is\n    // already real either way.\n    await emitSalesInvoiceCreated({")
    p = f"{APP}/app/api/accounting/sales/receipts/route.ts"
    edit(p, 'import { onAccountingReceiptCreated } from "@corelithzw/module-crm/accounting-hooks";\n', 'import { emitSalesReceiptCreated } from "@corelithzw/module-books/sales-hooks";\n')
    edit(p, "    await onAccountingReceiptCreated({", "    await emitSalesReceiptCreated({")

    # 3. the fiscal replay drains a school's receipts through the drain's registries, not the school
    fd = f"{MOD}/books/fiscal-drain.ts"
    edit(fd, "export const defaultFiscalDrainIssuers: FiscalDrainIssuers = {",
         '''/**
 * The receipts another module posted but never fiscalised — a process that
 * died between the payment's commit and the fiscal call — which the replay
 * sweeps as well as the retries. The module that owns the receipts finds
 * them; the host registers it beside the issuer.
 */
export type FiscalDrainSweep = {
  unattempted: (args: { companyId: string; limit: number }) => Promise<string[]>;
};

const registeredSweeps = registry<Partial<Record<keyof Omit<FiscalDrainIssuers, "salesInvoice">, FiscalDrainSweep>>>(
  "books.fiscal-drain-sweeps",
  () => ({}),
);

export function registerFiscalDrainSweep<K extends keyof Omit<FiscalDrainIssuers, "salesInvoice">>(kind: K, sweep: FiscalDrainSweep): void {
  registeredSweeps[kind] = sweep;
}

export function fiscalDrainSweep<K extends keyof Omit<FiscalDrainIssuers, "salesInvoice">>(kind: K): FiscalDrainSweep | undefined {
  return registeredSweeps[kind];
}

export const defaultFiscalDrainIssuers: FiscalDrainIssuers = {''')
    rp = f"{APP}/app/api/accounting/fiscalisation/replay/route.ts"
    edit(rp, 'import { issueFiscalReceipt } from "@corelithzw/module-books/fiscalisation";\nimport {\n  issueSchoolFeeReceiptFiscalisation,\n  SCHOOL_FISCALISATION_FEATURE,\n} from "@corelithzw/module-campus/fiscalisation";\nimport { hasFeature } from "@corelithzw/platform/features";\n',
             'import { issueFiscalReceipt } from "@corelithzw/module-books/fiscalisation";\nimport { defaultFiscalDrainIssuers, fiscalDrainSweep } from "@corelithzw/module-books/fiscal-drain";\n')
    edit(rp, '''    const remaining = Math.max(limit - candidates.length, 0);
    const schoolsFiscalise =
      remaining > 0 && (await hasFeature(companyId, SCHOOL_FISCALISATION_FEATURE));
    const unattempted =
      schoolsFiscalise
        ? await prisma.schoolFeeReceipt.findMany({
            where: {
              companyId,
              status: "POSTED",
              fiscalReceipt: { is: null },
            },
            orderBy: [{ createdAt: "asc" }],
            take: remaining,
            select: { id: true },
          })
        : [];
''', '''    // The school's receipts are the school's to find (`registerFiscalDrainSweep`
    // in the host's modules.ts); a host without the school sweeps nothing.
    const remaining = Math.max(limit - candidates.length, 0);
    const schoolSweep = fiscalDrainSweep("schoolFeeReceipt");
    const unattempted =
      remaining > 0 && schoolSweep ? await schoolSweep.unattempted({ companyId, limit: remaining }) : [];
''')
    edit(rp, '''        await attempt(async () => {
          const result = await issueSchoolFeeReceiptFiscalisation({
            companyId,
            receiptId: receipt.schoolReceiptId!,
          });
          return { status: result.fiscalStatus };
        });
''', '''        await attempt(() =>
          defaultFiscalDrainIssuers.schoolFeeReceipt({ companyId, receiptId: receipt.schoolReceiptId! }),
        );
''')
    edit(rp, '''    for (const receipt of unattempted) {
      await attempt(async () => {
        const result = await issueSchoolFeeReceiptFiscalisation({
          companyId,
          receiptId: receipt.id,
        });
        return { status: result.fiscalStatus };
      });
    }
''', '''    for (const receiptId of unattempted) {
      await attempt(() => defaultFiscalDrainIssuers.schoolFeeReceipt({ companyId, receiptId }));
    }
''')
    assert "hasFeature" not in read(rp) and "schoolFeeReceipt.findMany" not in read(rp)
    cf = f"{MOD}/campus/fiscalisation.ts"
    assert "export const SCHOOL_FISCALISATION_FEATURE" in read(cf)
    write(cf, read(cf).rstrip("\n") + '''

/**
 * Posted fee receipts with no fiscal receipt at all — a process that died
 * between the payment's commit and the fiscal call — oldest first, for the
 * books' replay to sweep. A school without the add-on has none to sweep.
 */
export async function unattemptedSchoolFeeReceipts(args: { companyId: string; limit: number }): Promise<string[]> {
  if (args.limit <= 0) return [];
  if (!(await hasFeature(args.companyId, SCHOOL_FISCALISATION_FEATURE))) return [];
  const receipts = await prisma.schoolFeeReceipt.findMany({
    where: { companyId: args.companyId, status: "POSTED", fiscalReceipt: { is: null } },
    orderBy: [{ createdAt: "asc" }],
    take: args.limit,
    select: { id: true },
  });
  return receipts.map((receipt) => receipt.id);
}
''')
    cfs = read(cf)
    assert re.search(r'import \{[^}]*\bhasFeature\b[^}]*\} from "@corelithzw/platform/features"', cfs), "campus fiscalisation imports hasFeature"
    assert re.search(r'import \{ prisma \} from "@corelithzw/db/client"', cfs), "campus fiscalisation imports prisma"
    edit(f"{APP}/modules.ts", 'import { onFiscalBacklog, registerFiscalDrainIssuer } from "@corelithzw/module-books/fiscal-drain";\n',
         'import { onFiscalBacklog, registerFiscalDrainIssuer, registerFiscalDrainSweep } from "@corelithzw/module-books/fiscal-drain";\nimport { onSalesInvoiceCreated, onSalesReceiptCreated } from "@corelithzw/module-books/sales-hooks";\n')
    edit(f"{APP}/modules.ts", '''  return { status: result.fiscalStatus, error: result.fiscalError ?? null };
});
''', '''  return { status: result.fiscalStatus, error: result.fiscalError ?? null };
});
registerFiscalDrainSweep("schoolFeeReceipt", {
  unattempted: async (args) => (await import("@corelithzw/module-campus/fiscalisation")).unattemptedSchoolFeeReceipts(args),
});

// The books announce a sales document; the CRM, downstream of the money,
// keeps its quote and its deal in step.
onSalesInvoiceCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingInvoiceCreated(event));
onSalesReceiptCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingReceiptCreated(event));
''')
    ft = f"{APP}/lib/host/schools-fee-fiscalisation.test.ts"
    edit(ft, 'import { grantBundleToCompany } from "@corelithzw/platform/entitlements";\n',
         'import { grantBundleToCompany } from "@corelithzw/platform/entitlements";\n// The replay drains through the registries the host fills.\nimport "@/modules";\n')

    # 4. the shared-record guard asks the module that owns the record type
    write(f"{MOD}/records/subject-guard.ts", '''/**
 * Who may read or write things filed against a record, whichever module owns it.
 *
 * Every `/api/v2/crm/**` route is gated on a `crm.*` feature by URL prefix, and
 * no school tenant has one; a prefix cannot be gated on two different
 * features. So the shared record routes are registered as always reachable and
 * check per SUBJECT TYPE, and the check is the owning module's: a CRM subject
 * needs `crm.core`, a school subject needs `schools.students` and the caller's
 * school role. Each module registers its guard from the host's `modules.ts`
 * (`registerRecordSubjectGuard`); a type whose module registered none is
 * refused, never let through.
 */
import { registry } from "@corelithzw/platform/registry";
import { recordType, type RecordType } from "./registry";

export type RecordGuardSession = { user: { companyId: string; role?: string | null } };
export type RecordGuardResult = { ok: true } | { ok: false; message: string; status: number };
export type RecordSubjectGuard = (session: RecordGuardSession, action: "view" | "create") => Promise<RecordGuardResult>;

const guards = registry<Map<string, RecordSubjectGuard>>("records.subject-guards", () => new Map());

/** A module's guard for the record types it owns, registered by the host that composes it. */
export function registerRecordSubjectGuard(module: string, guard: RecordSubjectGuard): void {
  guards.set(module, guard);
}

export async function guardRecordSubject(
  session: RecordGuardSession,
  subjectType: RecordType,
  action: "view" | "create",
): Promise<RecordGuardResult> {
  const config = recordType(subjectType);
  const guard = guards.get(config.module);
  if (!guard) {
    return { ok: false, message: `No guard registered for ${config.module} records`, status: 403 };
  }
  return guard(session, action);
}
''')
    write(f"{MOD}/crm/record-guard.ts", '''/**
 * The CRM's guard for things filed against its records: what the `/api/v2/crm`
 * prefix already enforces, so moving a caller onto the shared record routes
 * cannot widen its access.
 */
import { hasFeature } from "@corelithzw/platform/features";
import type { RecordSubjectGuard } from "@corelithzw/module-records/subject-guard";

export const crmRecordGuard: RecordSubjectGuard = async (session) => {
  const enabled = await hasFeature(session.user.companyId, "crm.core");
  if (!enabled) return { ok: false, message: "Feature disabled: crm.core", status: 403 };
  return { ok: true };
};
''')
    write(f"{MOD}/campus/record-guard.ts", '''/**
 * The school's guard for things filed against a pupil's record: the feature
 * says the tenant bought the module, the role says this person may do this to
 * a pupil's record. `edit` rather than `create` for writing, because filing a
 * note or a document against a child is editing that child's record rather
 * than creating a new one — and it is what a class teacher can legitimately do.
 */
import { hasFeature } from "@corelithzw/platform/features";
import type { RecordSubjectGuard } from "@corelithzw/module-records/subject-guard";
import { schoolPermissionDenial } from "./permissions";

export const schoolRecordGuard: RecordSubjectGuard = async (session, action) => {
  const enabled = await hasFeature(session.user.companyId, "schools.students");
  if (!enabled) return { ok: false, message: "Feature disabled: schools.students", status: 403 };
  const denied = schoolPermissionDenial(session, "schools.students", action === "view" ? "view" : "edit");
  if (denied) return { ok: false, message: denied, status: 403 };
  return { ok: true };
};
''')
    for name in ("files", "comments"):
        edit(f"{APP}/app/api/v2/records/{name}/route.ts", 'from "../_guard"', 'from "@corelithzw/module-records/subject-guard"')
    sh(f'git rm -q "{APP}/app/api/v2/records/_guard.ts"')
    edit(f"{APP}/modules.ts", 'import { registerSearchArm } from "@corelithzw/module-records/search";\n',
         'import { registerSearchArm } from "@corelithzw/module-records/search";\nimport { registerRecordSubjectGuard } from "@corelithzw/module-records/subject-guard";\n')
    edit(f"{APP}/modules.ts", "// The search box's arms: one per module with records worth typing at.\n",
         '''// Who may file against a record: the module that owns the record type decides.
registerRecordSubjectGuard("crm", async (session, action) => (await import("@corelithzw/module-crm/record-guard")).crmRecordGuard(session, action));
registerRecordSubjectGuard("schools", async (session, action) => (await import("@corelithzw/module-campus/record-guard")).schoolRecordGuard(session, action));

// The search box's arms: one per module with records worth typing at.
''')

    # 5. the document render route asks the source's module what a render needs
    sr = f"{MOD}/documents/source-registry.ts"
    edit(sr, '''export type DocumentSource = {
  id: string;
  matches: (sourceKey: string) => boolean;
  resolve: (input: {''', '''export type DocumentSourceSession = { user: { id: string; role: string; companyId: string } };
export type DocumentAuthorization = { allowed: true } | { allowed: false; status: number; message: string };

export type DocumentSource = {
  id: string;
  matches: (sourceKey: string) => boolean;
  /**
   * The feature keys that may authorise a render of this source; a tenant needs
   * only ONE of them. None means the session alone decides.
   */
  access?: (sourceKey: string) => Promise<{ featureKeys: string[] }>;
  /** Whether this caller may render this source, beyond the tenant having bought it. */
  authorize?: (input: { session: DocumentSourceSession; sourceKey: string; recordId?: string }) => Promise<DocumentAuthorization>;
  resolve: (input: {''')
    edit(sr, '''export function registeredDocumentSources(): DocumentSource[] {
  return [...sources.values()];
}
''', '''export function registeredDocumentSources(): DocumentSource[] {
  return [...sources.values()];
}

export function documentSourceFor(sourceKey: string): DocumentSource | undefined {
  return registeredDocumentSources().find((source) => source.matches(sourceKey));
}
''')
    rr = f"{APP}/app/api/documents/render/route.ts"
    edit(rr, '''import { hasFeature } from "@corelithzw/platform/features";
import {
  isSchoolDocumentSourceKey,
  SCHOOL_DOCUMENT_ACCESS,
} from "@corelithzw/module-campus/document-sources";
import {
  canRenderPayslip,
  HR_DOCUMENT_ACCESS,
  isHrDocumentSourceKey,
} from "@corelithzw/module-people/hr/document-sources";
import { isApproverRole } from "@corelithzw/module-workflow/approvals";
import { canSchoolRoleDo } from "@corelithzw/module-campus/permissions";
''', '''import { hasFeature } from "@corelithzw/platform/features";
import { documentSourceFor } from "@corelithzw/module-documents/source-registry";
''')
    s = read(rr)
    a = s.index("/**\n * Feature keys that may authorise an export source.")
    b = s.index("const requestSchema = z.object({")
    s = s[:a] + '''/**
 * Feature keys that may authorise an export source. A tenant needs only ONE of
 * them — sales documents are reachable from both accounting and the CRM, so a
 * CRM-only tenant must be able to render the quotation it just created. The
 * module that registered the source says which (`access`); a source nobody
 * registered has none.
 */
async function resolveFeatureKeys(sourceKey: string): Promise<string[]> {
  const access = await documentSourceFor(sourceKey)?.access?.(sourceKey);
  return access?.featureKeys ?? [];
}

''' + s[b:]
    write(rr, s)
    edit(rr, "    const featureKeys = resolveFeatureKeys(typedInput.sourceKey);\n", "    const featureKeys = await resolveFeatureKeys(typedInput.sourceKey);\n")
    s = read(rr)
    a = s.index("    // A school document is a pupil's data")
    b = s.index("    const queued = await enqueueDocumentRenderJob(")
    s = s[:a] + '''    // Beyond the tenant having bought the module: a school document is a
    // pupil's data and a payslip is one named person's pay, so the module that
    // registered the source says whether this caller may render it.
    const source = documentSourceFor(typedInput.sourceKey);
    if (source?.authorize) {
      const decision = await source.authorize({
        session,
        sourceKey: typedInput.sourceKey,
        recordId: typedInput.recordId,
      });
      if (!decision.allowed) return errorResponse(decision.message, decision.status);
    }

''' + s[b:]
    write(rr, s)
    assert "canSchoolRoleDo" not in s and "canRenderPayslip" not in s and "isApproverRole" not in s
    # the modules answer for their sources
    cd = f"{MOD}/campus/document-sources.ts"
    write(cd, read(cd).rstrip("\n") + '''

/** The feature that opens each school document, for the render route's check. */
export function schoolDocumentFeatureKeys(sourceKey: string): string[] {
  return isSchoolDocumentSourceKey(sourceKey) ? [SCHOOL_DOCUMENT_ACCESS[sourceKey].feature] : [];
}

/**
 * A school document is a pupil's data — a class list is every child's
 * guardian and phone number on one page — so the tenant having bought the
 * module is not the bar. `view` because rendering reads; nothing here writes.
 */
export function authorizeSchoolDocument(input: { session: { user: { role: string } }; sourceKey: string }): DocumentAuthorization {
  if (!isSchoolDocumentSourceKey(input.sourceKey)) return { allowed: true };
  const { resource } = SCHOOL_DOCUMENT_ACCESS[input.sourceKey];
  if (!canSchoolRoleDo(input.session.user.role, resource, "view")) {
    return { allowed: false, status: 403, message: `Your role cannot view ${resource.replace("schools.", "")}` };
  }
  return { allowed: true };
}
''')
    edit(cd, 'import type { SchoolResource } from "./permissions";\n',
         'import type { DocumentAuthorization } from "@corelithzw/module-documents/source-registry";\nimport { canSchoolRoleDo, type SchoolResource } from "./permissions";\n')
    hd = f"{MOD}/people/hr/document-sources.ts"
    write(hd, read(hd).rstrip("\n") + '''

/**
 * The features that open a payslip: either key, because an employee fetching
 * their own has `hr.employee-self-service` and not `hr.payslips` — the
 * row-level check in `authorizeHrDocument` is what keeps them to their own.
 */
export function hrDocumentFeatureKeys(sourceKey: string): string[] {
  if (!isHrDocumentSourceKey(sourceKey)) return [];
  const access = HR_DOCUMENT_ACCESS[sourceKey];
  return access.selfServiceFeature ? [access.feature, access.selfServiceFeature] : [access.feature];
}

/**
 * A payslip is one named person's pay. The feature check says the tenant has
 * payroll; this says whose payslip the caller may see. HR staff see any;
 * everybody else sees their own and nothing else.
 */
export async function authorizeHrDocument(input: {
  session: { user: { id: string; role: string; companyId: string } };
  sourceKey: string;
  recordId?: string;
}): Promise<DocumentAuthorization> {
  if (!isHrDocumentSourceKey(input.sourceKey)) return { allowed: true };
  if (!input.recordId) return { allowed: false, status: 400, message: "A payslip needs the payroll line it belongs to" };
  const decision = await canRenderPayslip({
    companyId: input.session.user.companyId,
    lineItemId: input.recordId,
    userId: input.session.user.id,
    hasPayrollAccess:
      isApproverRole(input.session.user.role) &&
      (await hasFeature(input.session.user.companyId, HR_DOCUMENT_ACCESS["hr.payslip"].feature)),
  });
  // 404, not 403: a 403 would confirm the payslip exists, which lets somebody
  // map the workforce by probing ids.
  if (!decision.allowed) return { allowed: false, status: 404, message: decision.reason };
  return { allowed: true };
}
''')
    edit(hd, 'import type { UniversalDocumentPayload } from "@corelithzw/module-documents/types";\n',
         'import type { UniversalDocumentPayload } from "@corelithzw/module-documents/types";\nimport type { DocumentAuthorization } from "@corelithzw/module-documents/source-registry";\nimport { isApproverRole } from "@corelithzw/module-workflow/approvals";\nimport { hasFeature } from "@corelithzw/platform/features";\n')
    edit(f"{APP}/modules.ts", '''registerDocumentSource({
  id: "schools",
  matches: (key) => key.startsWith("schools."),
  resolve: async (input) => {''', '''registerDocumentSource({
  id: "schools",
  matches: (key) => key.startsWith("schools."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-campus/document-sources")).schoolDocumentFeatureKeys(key) }),
  authorize: async (input) => (await import("@corelithzw/module-campus/document-sources")).authorizeSchoolDocument(input),
  resolve: async (input) => {''')
    edit(f"{APP}/modules.ts", '''registerDocumentSource({
  id: "hr",
  matches: (key) => key.startsWith("hr."),
  resolve: async (input) => {''', '''registerDocumentSource({
  id: "hr",
  matches: (key) => key.startsWith("hr."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-people/hr/document-sources")).hrDocumentFeatureKeys(key) }),
  authorize: async (input) => (await import("@corelithzw/module-people/hr/document-sources")).authorizeHrDocument(input),
  resolve: async (input) => {''')
    ld = f"{APP}/lib/host/document-sources.ts"
    edit(ld, "export const legacyDocumentSource: DocumentSource = {\n", '''/** The feature that opens each legacy source; sales documents open from the books or the CRM. */
const LEGACY_DOCUMENT_FEATURES: Record<string, string[]> = {
  "reports.shift": ["reports.shift"],
  "reports.attendance": ["reports.attendance"],
  "reports.plant": ["reports.plant"],
  "dashboard.executive-summary": ["reports.dashboard"],
  "accounting.sales.invoice": ["accounting.ar", "crm.documents"],
  "accounting.sales.quotation": ["accounting.ar", "crm.documents"],
  "accounting.sales.receipt": ["accounting.ar", "crm.documents"],
  "accounting.sales.credit-note": ["accounting.ar"],
};

export const legacyDocumentSource: DocumentSource = {
  access: async (sourceKey) => ({ featureKeys: LEGACY_DOCUMENT_FEATURES[sourceKey] ?? [] }),
''')

    # 6. the v2 collection stub is the kernel's; the gold audit helper is gold's; a shared option type is the ui's
    sh(f'git mv "{APP}/app/api/v2/_shared.ts" "{PK}/platform/v2-collection.ts"')
    vc = f"{PK}/platform/v2-collection.ts"; s = read(vc)
    a = s.index("type V2CollectionResource ="); b = s.index("type V2CollectionRecord = {")
    s = s[:a] + "/** A resource a v2 collection endpoint names; the modules choose the words. */\ntype V2CollectionResource = string;\n\n" + s[b:]
    write(vc, "/**\n * The empty collection response a v2 endpoint returns while its resource has\n * no listing yet: the session validated, the resource named, no records.\n */\n" + s)
    shared_n = 0
    for p in walk(f"{APP}/app/api/v2"):
        s = read(p)
        def to_kernel(mm):
            target = os.path.normpath(os.path.join(os.path.dirname(p), mm.group(1)))
            return 'from "@corelithzw/platform/v2-collection"' if target == f"{APP}/app/api/v2/_shared" else mm.group(0)
        new = re.sub(r'from "((?:\.\./)+_shared)"', to_kernel, s)
        if new != s: write(p, new); shared_n += 1
    assert shared_n == 3, f"v2/_shared importers rewritten: {shared_n}"
    sh(f'git mv "{APP}/lib/audit/gold.ts" "{MOD}/gold/audit.ts"'); sh(f'git mv "{APP}/lib/audit/gold.test.ts" "{MOD}/gold/audit.test.ts"')
    edit(f"{MOD}/gold/audit.test.ts", 'from "./gold"', 'from "./audit"')
    sh(f'rmdir "{APP}/lib/audit"')
    for p in walk(f"{APP}/app/api/gold"):
        s = read(p); new = s.replace('"@/lib/audit/gold"', '"@corelithzw/module-gold/audit"')
        if new != s: write(p, new)
    for name in ("orders", "receipts"):
        edit(f"{APP}/app/retail/purchasing/{name}/page.tsx", 'import type { SearchableOption } from "@corelithzw/module-gold/types";', 'import type { SearchableOption } from "@corelithzw/ui/components/searchable-select";')

    # 7. the document-template settings screen is the documents module's
    move_tree(f"{APP}/components/settings/templates/template-settings-page.tsx", f"{MOD}/documents/components/settings/templates/template-settings-page.tsx")
    sh(f'rmdir "{APP}/components/settings/templates"')
    edit(f"{APP}/app/preferences/organization/templates/page.tsx", '"@/components/settings/templates/template-settings-page"', '"@corelithzw/module-documents/components/settings/templates/template-settings-page"')
    ts_ = f"{APP}/components/settings/template-studio.tsx"
    if not any("template-studio" in read(p) for p in walk(APP) if p != ts_):
        move_tree(ts_, f"{MOD}/documents/components/settings/template-studio.tsx"); print("template-studio moved with the settings page (nothing in the host imported it)")
    print("seams done")

if want("move"):
    for mod, dirs in API_MOVES.items():
        for d in dirs: move_tree(f"{APP}/app/{d}", f"{MOD}/{mod}/api/{d[len('api/'):]}")
    for mod, dirs in PAGE_MOVES.items():
        for d in dirs: move_tree(f"{APP}/app/{d}", f"{MOD}/{mod}/pages/{d}")
    # the host tests that scan the moved trees go with them
    move_tree(f"{APP}/lib/host/hr-route-guard-coverage.test.ts", f"{MOD}/people/api/route-guard-coverage.test.ts")
    p = f"{MOD}/people/api/route-guard-coverage.test.ts"; s = read(p)
    assert s.count("].map((relative) => join(process.cwd(), relative));") == 1 or "join(__dirname, relative)" in s
    s = s.replace("].map((relative) => join(process.cwd(), relative));", "].map((relative) => join(__dirname, relative));")
    s = re.sub(r'"app/api/([a-z-]+)"', r'"\1"', s)
    assert '"app/api/' not in s, "people guard test still names app/api"
    s = s.replace("process.cwd()", "__dirname")
    write(p, s)
    move_tree(f"{APP}/lib/host/retail-route-guard-coverage.test.ts", f"{MOD}/sell/api/route-guard-coverage.test.ts")
    p = f"{MOD}/sell/api/route-guard-coverage.test.ts"; s = read(p)
    if "process.cwd()" in s:
        edit(p, 'join(process.cwd(), "app/api/v2/retail")', 'join(__dirname, "v2/retail")')
        edit(p, 'join(process.cwd(), "app/api/v2/pos")', 'join(__dirname, "v2/pos")')
    s = read(p).replace("process.cwd()", "__dirname"); write(p, s)
    move_tree(f"{APP}/lib/host/retail-pos-host.test.ts", f"{MOD}/sell/pos-host-pages.test.ts")
    p = f"{MOD}/sell/pos-host-pages.test.ts"
    if "REPO_ROOT" in read(p):
      edit(p, 'const REPO_ROOT = process.cwd();', 'const PACKAGE_ROOT = __dirname;')
      edit(p, '    // `/portal/pos/held` → `app/portal/pos/held/page.tsx`; the root is `app/portal/pos/page.tsx`.\n    const pagePath = join(REPO_ROOT, "app", `${internalHref.replace(/^\\//, "")}`, "page.tsx");',
            '    // `/portal/pos/held` → `pages/portal/pos/held/page.tsx`; the root is `pages/portal/pos/page.tsx`.\n    const pagePath = join(PACKAGE_ROOT, "pages", `${internalHref.replace(/^\\//, "")}`, "page.tsx");')
    assert "REPO_ROOT" not in read(p)
    # the page-actions budget lint reads the retail pages: it goes with them; the rail-and-sidebar checks read the host's navigation and stay
    ra = f"{APP}/lib/host/retail-areas.test.ts"; s = read(ra)
    assert 'describe("page actions stay within the composition budget"' in s, "retail-areas already split"
    cut_at = s.rindex("/**", 0, s.index('describe("page actions stay within the composition budget"'))
    block = s[cut_at:]; s = s[:cut_at].rstrip("\n") + "\n"
    block = re.sub(r'"app/retail/', '"pages/retail/', block)
    block = block.replace("readFileSync(join(process.cwd(), page), \"utf8\")", "readFileSync(join(__dirname, page), \"utf8\")")
    assert "process.cwd()" not in block and "app/retail" not in block
    write(f"{MOD}/sell/retail-pages.test.ts", '/**\n * The retail screens\' composition budget: a page declares at most three actions.\n */\nimport { describe, expect, it } from "vitest";\nimport { readFileSync } from "node:fs";\nimport { join } from "node:path";\n\n' + block)
    for imp in ('import { readFileSync } from "node:fs";\n', 'import { join } from "node:path";\n'):
        name = "readFileSync" if "readFileSync" in imp else "join("
        if name not in s.replace(imp, ""): s = s.replace(imp, "")
    write(ra, s)
    # the records routes' guard coverage, in the records package too
    write(f"{MOD}/records/api/route-guard-coverage.test.ts", read(f"{APP}/lib/host/records-route-guard-coverage.test.ts")
          .replace('const RECORDS_API = join(process.cwd(), "app/api/v2/records");', 'const RECORDS_API = join(__dirname, "v2/records");')
          .replace("expect(files.length).toBeGreaterThan(2);", "expect(files.length).toBeGreaterThan(1);")
          .replace("file.replace(process.cwd() + \"/\", \"\")", "file.replace(__dirname + \"/\", \"\")"))
    print("moved")

if want("rewrite"):
    for mod in MODULES:
        pkg = f"{MOD}/{mod}"; spec = f"@corelithzw/module-{mod}/"; m = 0
        for p in walk(pkg):
            s = read(p); d = os.path.dirname(p)
            def repl(mm):
                t = mm.group(2)
                if not t.startswith(spec): return mm.group(0)
                r = os.path.relpath(os.path.join(pkg, t[len(spec):]), d)
                return f'{mm.group(1)}{r if r.startswith(".") else "./" + r}{mm.group(1)}'
            new = re.compile(r'(["\'])(@corelithzw/module-' + mod + r'/[^"\']+)\1').sub(repl, s)
            if new != s: write(p, new); m += 1
        if m: print(f"relativised {m} files in {mod}")

if want("compose"):
    sh("node scripts/compose-host.mjs apps/legacy " + " ".join(MODULES))

if want("deps"):
    legacy = json.load(open(f"{APP}/package.json"))
    versions = {**legacy.get("devDependencies", {}), **legacy.get("dependencies", {})}
    SKIP = {"next", "react", "react-dom"}
    for mod in MODULES:
        pj = f"{MOD}/{mod}/package.json"; d = json.load(open(pj))
        have = set(d.get("dependencies", {})) | set(d.get("peerDependencies", {})) | set(d.get("devDependencies", {}))
        bare = set()
        for p in walk(f"{MOD}/{mod}"):
            for m in re.finditer(r'from "([^"]+)"', read(p)):
                spec = m.group(1)
                if spec.startswith((".", "@/", "node:")): continue
                pkg = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
                if pkg in SKIP or pkg in have or pkg in ("fs", "path", "crypto", "http", "stream", "buffer", "os", "url", "events", "util"): continue
                if pkg.startswith("@corelithzw/module-"): continue
                bare.add(pkg)
        added = []
        for pkg in sorted(bare):
            if pkg not in versions: print(f"!! {mod}: no version known for {pkg}"); continue
            dev = pkg.startswith("@types/") or pkg in ("vitest", "eslint")
            d.setdefault("devDependencies" if dev else "dependencies", {})[pkg] = versions[pkg]; added.append(pkg)
            if pkg == "bcryptjs" and "@types/bcryptjs" in versions and "@types/bcryptjs" not in have:
                d.setdefault("devDependencies", {})["@types/bcryptjs"] = versions["@types/bcryptjs"]; added.append("@types/bcryptjs")
        if added:
            for k in ("dependencies", "devDependencies"): d[k] = dict(sorted(d[k].items()))
            write(pj, json.dumps(d, indent=2) + "\n"); print(f"{mod}: deps added {added}")
        # modules a route or page now names, beyond the manifest
        mf = f"{MOD}/{mod}/manifest.ts"; ms = read(mf)
        rm = re.search(r'requires: \[([^\]]*)\]', ms)
        reqs = [x.strip().strip('"') for x in rm.group(1).split(",") if x.strip()] if rm else []
        used = sorted({m.group(1) for p in walk(f"{MOD}/{mod}") for m in re.finditer(r'"@corelithzw/module-([a-z]+)/', read(p))} - {mod})
        extra = [u for u in used if u not in reqs]
        allowed = EXTRA_REQUIRES.get(mod, [])
        assert set(extra) <= set(allowed), f"{mod} now names modules its manifest does not require: {extra} (allowed {allowed})"
        if extra:
            assert rm, f"{mod} manifest has no requires"
            ms = ms[:rm.start()] + "requires: [" + ", ".join(f'"{r}"' for r in reqs + extra) + "]" + ms[rm.end():]
            write(mf, ms); print(f"{mod}: manifest requires += {extra}")
            d = json.load(open(pj)); ch = False
            for e in extra:
                if f"@corelithzw/module-{e}" not in d["dependencies"]: d["dependencies"][f"@corelithzw/module-{e}"] = "workspace:*"; ch = True
            if ch: d["dependencies"] = dict(sorted(d["dependencies"].items())); write(pj, json.dumps(d, indent=2) + "\n")

if want("check"):
    left = [os.path.relpath(p, PK) for mod in MODULES for p in walk(f"{MOD}/{mod}") if re.search(r'["\']@/', read(p))]
    print("package files importing '@/':", left or "none")
    api_left = sorted({os.path.relpath(p, f"{APP}/app") for p in walk(f"{APP}/app/api") if "Composed from" not in read(p)})
    print("host api files not composed:", len(api_left)); print("  " + "\n  ".join(api_left))
    thin = sum(1 for p in walk(f"{APP}/app") if "Composed from" in read(p)); print("thin files in host:", thin)
