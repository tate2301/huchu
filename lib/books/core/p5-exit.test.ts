/**
 * The P5 exit test (books-final §8):
 *
 * - No page under /accounting renders: every address redirects, and nothing
 *   in the app links there any more.
 * - A workspace without `books.screens` posts a pay run and a CRM requisition
 *   through the engine, sees the upsell state at /books, and downloads an
 *   accountant export whose trial balance equals the one the Trial balance
 *   page shows a workspace with the screens, for the same data.
 *
 * The routes run for real with only the sign-in faked; the proxy's part is
 * the same `canAccessRouteWithToken` it calls.
 */
import fs from "node:fs";
import path from "node:path";

import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { postPayrollRun } from "@/lib/hr/payroll/posting";
import { denyFeaturesToCompany, getCompanyFeatureMap } from "@/lib/platform/entitlements";
import { canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, makeBooksFixture, type BooksFixture } from "../invoice-test-fixtures";
import { readUpsellFacts, upsellView } from "../upsell";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET as downloadExport } from "@/app/api/books/accountant-export/route";
import { GET as readTrialBalancePage } from "@/app/api/books/trial-balance/route";
import { PATCH as actOnRequisition } from "@/app/api/v2/crm/requisitions/[id]/route";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

const root = process.cwd();

function files(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files(rel, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Addresses in code, not in comments or API calls: "/accounting…" in a string or template. */
function accountingLinksIn(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(/["'`](\/accounting(?:[/?][^"'`\s]*)?)["'`]/g)].map((match) => match[1]);
}

describe("no page under /accounting renders (books-final §8 P5)", () => {
  it("forwards every address there: each page redirects, and an unknown one too", () => {
    const pages = files("app/accounting");
    expect(pages.length).toBeGreaterThanOrEqual(18);
    for (const file of pages) {
      expect(path.basename(file), file).toBe("page.tsx");
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).toMatch(/redirect\((movedTo|\w+MovedTo)\(/);
      expect(source, `${file} draws something`).not.toMatch(/<\/|\/>/);
    }
    expect(pages).toContain(path.join("app", "accounting", "[...rest]", "page.tsx"));
  });

  it("is linked from nowhere: the app, its emails, Vane, Explore, reports and notifications", () => {
    const allowed = new Set([
      // The map of where each old address went.
      path.join("lib", "books", "moved.ts"),
      // Gates and guards for the old addresses while they forward, not links.
      path.join("lib", "platform", "gating", "route-registry.ts"),
      path.join("lib", "platform", "gating", "portal-isolation.ts"),
    ]);
    const sources = ["app", "components", "lib", "hooks", "emails"]
      .filter((dir) => fs.existsSync(path.join(root, dir)))
      .flatMap((dir) => files(dir))
      .filter((file) => !/\.test\.tsx?$/.test(file) && !file.startsWith(path.join("app", "accounting")) && !allowed.has(file));
    const links = sources.flatMap((file) => accountingLinksIn(fs.readFileSync(path.join(root, file), "utf8")).map((href) => `${file}: ${href}`));
    expect(links).toEqual([]);
  });
});

describe("a workspace without the Books screens (books-final §1.1, §8 P5)", () => {
  let fixture: BooksFixture;
  let features: string[];
  const runIds: string[] = [];
  let employeeId: string;
  let periodId: string;

  const session = (enabledFeatures: string[]) => ({
    session: { user: { id: fixture.ownerId, companyId: fixture.companyId, role: "SUPERADMIN", name: "James Nyabadza", email: "j@books.test", enabledFeatures } },
  });

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET ??= "test-secret";
    fixture = await makeBooksFixture("P5 exit");
    await denyFeaturesToCompany({ companyId: fixture.companyId, featureKeys: ["books.screens", "accounting.core"], reason: "P5 exit: a workspace without the screens" });
    const map = await getCompanyFeatureMap(fixture.companyId);
    features = Object.keys(map).filter((key) => map[key]);
  }, 180_000);

  afterAll(async () => {
    if (!fixture) return;
    const { companyId } = fixture;
    await prisma.notification.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
    await prisma.crmDailyLog.deleteMany({ where: { companyId } });
    await prisma.crmRequisition.deleteMany({ where: { companyId } });
    await prisma.bankTransaction.deleteMany({ where: { companyId } });
    await prisma.payrollLineComponent.deleteMany({ where: { lineItem: { run: { companyId } } } });
    await prisma.payrollLineItem.deleteMany({ where: { run: { companyId } } });
    await prisma.payrollRun.deleteMany({ where: { companyId } });
    await prisma.payrollPeriod.deleteMany({ where: { companyId } });
    await prisma.employee.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await destroyBooksFixture(fixture);
  }, 60_000);

  it("has the engine and not the screens, whatever its flags say", () => {
    expect(features).toContain("accounting.core");
    expect(features).not.toContain("books.screens");
  });

  it("posts a pay run through the core", async () => {
    employeeId = (await prisma.employee.create({
      data: { companyId: fixture.companyId, employeeId: "EMP-P5-1", name: "Ada Moyo", phone: "0770000000", nextOfKinName: "Kin", nextOfKinPhone: "0770000001", passportPhotoUrl: "https://example.invalid/p.jpg", villageOfOrigin: "Village" },
      select: { id: true },
    })).id;
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodId = (await prisma.payrollPeriod.create({
      data: { companyId: fixture.companyId, periodKey: start.toISOString().slice(0, 7), startDate: start, endDate: now, dueDate: now, createdById: fixture.ownerId },
      select: { id: true },
    })).id;
    const run = await prisma.payrollRun.create({
      data: {
        companyId: fixture.companyId,
        periodId,
        runNumber: 1,
        status: "APPROVED",
        createdById: fixture.ownerId,
        lineItems: {
          create: [{
            employeeId,
            baseAmount: 1000,
            grossAmount: 1000,
            deductionsTotal: 145,
            netAmount: 855,
            netBaseAmount: 855,
            components: {
              create: [
                { name: "PAYE", type: "STATUTORY_DEDUCTION", calcMethod: "TAX_TABLE", rateOrAmount: 0, amount: 100, statutoryKey: "PAYE" },
                { name: "NSSA", type: "STATUTORY_DEDUCTION", calcMethod: "PERCENT", rateOrAmount: 4.5, amount: 45, statutoryKey: "NSSA_POBS_EMPLOYEE" },
              ],
            },
          }],
        },
      },
      select: { id: true, runNumber: true },
    });
    runIds.push(run.id);

    const outcome = await postPayrollRun({ companyId: fixture.companyId, runId: run.id, runNumber: run.runNumber, entryDate: now, createdById: fixture.ownerId, actorRole: "SUPERADMIN" });
    expect(outcome).toMatchObject({ posted: true });
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "PAYROLL_RUN", sourceId: run.id }, include: { lines: true } });
    expect(entry.status).toBe("POSTED");
    const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
    const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.005);
  });

  it("posts a CRM requisition paid out, through the CRM's own route", async () => {
    const ledger = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code: "1016" }, select: { id: true } });
    const ecocash = (await prisma.bankAccount.create({ data: { companyId: fixture.companyId, name: "EcoCash", kind: "MOBILE", ledgerAccountId: ledger.id }, select: { id: true } })).id;
    const requisition = await prisma.crmRequisition.create({
      data: { companyId: fixture.companyId, requisitionNo: `REQ-P5${fixture.stamp.slice(-5)}`, category: "FUEL", purpose: "Diesel for the Kadoma run", amount: 400, requestedById: fixture.managerId, status: "APPROVED", approvedById: fixture.ownerId, approvedAt: new Date() },
    });
    // The route answers a session with no Books screens: the CRM's money is never gated by them.
    expect(canAccessRouteWithToken(`/api/v2/crm/requisitions/${requisition.id}`, features).featureKey).not.toBe("books.screens");
    validateSessionMock.mockResolvedValue(session(features));
    const response = await actOnRequisition(
      new NextRequest(`http://crm.test/api/v2/crm/requisitions/${requisition.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disburse", bankAccountId: ecocash }) }),
      { params: Promise.resolve({ id: requisition.id }) },
    );
    expect(response.status).toBe(200);
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: requisition.id } });
    expect(entry.status).toBe("POSTED");
  });

  it("sees the upsell at /books, with its own figures", async () => {
    // The proxy's answer: refused on the screens, which it lets through to the upsell (proxy.ts, denyPageFeature).
    expect(canAccessRouteWithToken("/books", features)).toMatchObject({ allowed: false, featureKey: "books.screens" });
    expect(canAccessRouteWithToken("/books/journals", features)).toMatchObject({ allowed: false, featureKey: "books.screens" });
    expect(canAccessRouteWithToken("/api/books/trial-balance", features)).toMatchObject({ allowed: false, featureKey: "books.screens" });
    const view = upsellView(await readUpsellFacts(prisma, fixture.companyId), "SUPERADMIN", new Date());
    expect(view.finding.fact).toMatch(/^Your books hold 2 entries since \d{1,2} \w+\.$/);
    expect(view.finding.rest).toBe("Every sale, payment and pay run has posted.");
    expect(view.canAdd).toBe(true);
  });

  it("downloads an accountant export whose trial balance is the Trial balance page's, for the same data", async () => {
    expect(canAccessRouteWithToken("/api/books/accountant-export", features)).toMatchObject({ allowed: true });
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const [year, mm] = month.split("-").map(Number) as [number, number];
    const monthEnd = new Date(Date.UTC(year, mm, 0)).toISOString().slice(0, 10);

    validateSessionMock.mockResolvedValue(session(features));
    const download = await downloadExport(new NextRequest(`http://books.test/api/books/accountant-export?from=${year}-01-01&to=${monthEnd}`));
    expect(download.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await download.arrayBuffer()) as ArrayBuffer);
    const sheet = workbook.getWorksheet("Trial balance")!;
    const exported: Array<[string, number, number]> = [];
    let header = false;
    sheet.eachRow((row) => {
      const values = row.values as unknown[];
      if (!header) {
        header = values[1] === "Code";
        return;
      }
      exported.push([String(values[1] ?? ""), Number(values[4] ?? 0), Number(values[5] ?? 0)]);
    });

    // The same workspace, with the screens: what its Trial balance page shows as at the month's end.
    const withScreens = [...features, "books.screens", "accounting.trial-balance"];
    expect(canAccessRouteWithToken("/api/books/trial-balance", withScreens)).toMatchObject({ allowed: true });
    validateSessionMock.mockResolvedValue(session(withScreens));
    const page = await readTrialBalancePage(new NextRequest(`http://books.test/api/books/trial-balance?view=month&month=${month}`));
    expect(page.status).toBe(200);
    const shown = (await page.json()) as { rows: Array<{ code: string; debit: number; credit: number }>; debit: number; credit: number };
    expect(shown.rows.length).toBeGreaterThan(0);
    expect(exported).toEqual([...shown.rows.map((row) => [row.code, row.debit, row.credit] as [string, number, number]), ["", shown.debit, shown.credit]]);
    expect(shown.debit).toBe(shown.credit);
  });
});
