/**
 * Payroll posting — the summary, and both sides of the accounting seam.
 *
 * The summary tests are pure. They matter because the same function feeds the
 * journal and (in HR-6) the statutory returns: if it double-counts a tax credit,
 * the ledger goes short *and* the P2 over-reports, and the two would still agree
 * with each other, which is the worst kind of wrong.
 *
 * The seam tests are the ones the payroll-only product depends on. A run in a
 * workspace with no accounting module has to complete, post nothing, and say so.
 * Saying so is the whole point: silently pretending to post is what loses money,
 * because the first person to notice is whoever tries to reconcile a payable
 * balance that was never written.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { ensureAccountingDefaults } from "@corelithzw/module-books/bootstrap";
import { seedZimbabweStatutoryPack } from "../statutory/zimbabwe-pack";
import { assembleSalaryRun } from "./assemble";
import { postPayrollRun, summariseStatutory } from "./posting";

const d = (value: string | number) => new Prisma.Decimal(value);

describe("summariseStatutory", () => {
  it("routes each statutory key to its own basis", () => {
    const breakdown = summariseStatutory([
      { type: "STATUTORY_DEDUCTION", amount: d("207.13"), statutoryKey: "PAYE" },
      { type: "STATUTORY_DEDUCTION", amount: d("6.21"), statutoryKey: "AIDS_LEVY" },
      { type: "STATUTORY_DEDUCTION", amount: d("31.50"), statutoryKey: "NSSA_POBS_EMPLOYEE" },
      { type: "EMPLOYER_CONTRIBUTION", amount: d("31.50"), statutoryKey: "NSSA_POBS_EMPLOYER" },
      { type: "EMPLOYER_CONTRIBUTION", amount: d("10"), statutoryKey: "ZIMDEF" },
    ]);

    expect(breakdown.PAYE?.toString()).toBe("207.13");
    expect(breakdown.AIDS_LEVY?.toString()).toBe("6.21");
    expect(breakdown.NSSA_EMPLOYEE?.toString()).toBe("31.5");
    expect(breakdown.NSSA_EMPLOYER?.toString()).toBe("31.5");
    expect(breakdown.ZIMDEF?.toString()).toBe("10");
    // The aggregate the single expense debit is struck on.
    expect(breakdown.EMPLOYER_CONTRIBUTIONS?.toString()).toBe("41.5");
  });

  it("folds APWCS into the NSSA payable, since NSSA collects both", () => {
    const breakdown = summariseStatutory([
      { type: "EMPLOYER_CONTRIBUTION", amount: d("31.50"), statutoryKey: "NSSA_POBS_EMPLOYER" },
      { type: "EMPLOYER_CONTRIBUTION", amount: d("9"), statutoryKey: "NSSA_APWCS" },
    ]);
    expect(breakdown.NSSA_EMPLOYER?.toString()).toBe("40.5");
  });

  it("EXCLUDES a tax credit — the engine already applied it", () => {
    // `slice.paye` is the post-credit figure. Crediting the reduction again here
    // would leave the journal short by the credit and make the P2 over-report.
    const breakdown = summariseStatutory([
      { type: "STATUTORY_DEDUCTION", amount: d("147.13"), statutoryKey: "PAYE" },
      { type: "ALLOWANCE", amount: d("60"), statutoryKey: "TAX_CREDIT_MEDICAL_AID" },
    ]);
    expect(breakdown.PAYE?.toString()).toBe("147.13");
    expect(breakdown.OTHER_DEDUCTIONS).toBeUndefined();
  });

  it("excludes the bonus exemption note, which is not money moving", () => {
    const breakdown = summariseStatutory([
      { type: "ALLOWANCE", amount: d("0"), statutoryKey: "BONUS_EXEMPTION" },
    ]);
    expect(Object.keys(breakdown)).toEqual([]);
  });

  it("puts a non-statutory deduction in OTHER_DEDUCTIONS", () => {
    const breakdown = summariseStatutory([
      { type: "DEDUCTION", amount: d("100"), statutoryKey: null },
      { type: "DEDUCTION", amount: d("50"), statutoryKey: "PENSION" },
    ]);
    expect(breakdown.OTHER_DEDUCTIONS?.toString()).toBe("150");
  });

  it("does not lose an unrecognised statutory key", () => {
    // A company that invents a key must not have the amount vanish, or the entry
    // would not balance.
    const breakdown = summariseStatutory([
      { type: "STATUTORY_DEDUCTION", amount: d("42"), statutoryKey: "SOME_NEW_LEVY" },
    ]);
    expect(breakdown.OTHER_DEDUCTIONS?.toString()).toBe("42");
  });

  it("ignores earnings — they are covered by GROSS", () => {
    const breakdown = summariseStatutory([
      { type: "ALLOWANCE", amount: d("1000"), statutoryKey: null },
    ]);
    expect(Object.keys(breakdown)).toEqual([]);
  });
});

describe("the accounting seam", () => {
  let companyId: string;
  let actorId: string;
  let employeeId: string;
  let periodId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const company = await prisma.company.create({
      data: { name: `Payroll posting ${stamp}`, slug: `payroll-posting-${stamp}` },
      select: { id: true },
    });
    companyId = company.id;

    const actor = await prisma.user.create({
      data: {
        companyId,
        email: `posting-${stamp}@example.invalid`,
        name: "Posting Actor",
        password: "not-a-real-password",
        role: "MANAGER",
      },
      select: { id: true },
    });
    actorId = actor.id;

    await ensureAccountingDefaults(companyId);
    await seedZimbabweStatutoryPack({ companyId });

    const employee = await prisma.employee.create({
      data: {
        companyId,
        employeeId: "EMP-POST-1",
        name: "Ada Moyo",
        phone: "0770000000",
        nextOfKinName: "Kin",
        nextOfKinPhone: "0770000001",
        passportPhotoUrl: "https://example.invalid/p.jpg",
        villageOfOrigin: "Village",
        taxNumber: "BP1234567",
        nssaNumber: "NSSA-0001",
      },
      select: { id: true },
    });
    employeeId = employee.id;

    await prisma.compensationProfile.create({
      data: {
        employeeId,
        baseAmount: "1000",
        currency: "USD",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        workflowStatus: "APPROVED",
        createdById: actorId,
      },
    });

    const period = await prisma.payrollPeriod.create({
      data: {
        companyId,
        periodKey: "2026-08",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-31T23:59:59.999Z"),
        dueDate: new Date("2026-09-05T00:00:00.000Z"),
        createdById: actorId,
      },
      select: { id: true },
    });
    periodId = period.id;
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
    await prisma.payrollLineComponent.deleteMany({
      where: { lineItem: { run: { companyId } } },
    });
    await prisma.payrollLineItem.deleteMany({ where: { run: { companyId } } });
    await prisma.payrollRun.deleteMany({ where: { companyId } });
    await prisma.payrollPeriod.deleteMany({ where: { companyId } });
    await prisma.compensationProfile.deleteMany({ where: { employee: { companyId } } });
    await prisma.employee.deleteMany({ where: { companyId } });
    await prisma.payeTable.deleteMany({ where: { companyId } });
    await prisma.statutoryRate.deleteMany({ where: { companyId } });
    await prisma.taxCredit.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    // The accounting seed leaves tax templates whose lines reference tax codes,
    // and neither cascade order resolves cleanly. Same approach as
    // `fee-ledger-posting.test.ts`: attempt the delete and leave the row behind
    // if the constraints refuse, rather than failing a green suite on cleanup.
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  });

  /** Persist a computed run so `postPayrollRun` has something to read. */
  async function makeRun(runNumber: number) {
    const assembled = await assembleSalaryRun({
      companyId,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-31T23:59:59.999Z"),
      appliesToContractorsOnly: false,
    });
    expect(assembled.gaps).toEqual([]);
    expect(assembled.lines).toHaveLength(1);

    const line = assembled.lines[0];
    const slice = line.payroll.slices[0];

    const run = await prisma.payrollRun.create({
      data: {
        companyId,
        periodId,
        runNumber,
        status: "APPROVED",
        grossTotal: slice.grossAmount,
        allowancesTotal: slice.allowancesTotal,
        deductionsTotal: slice.deductionsTotal,
        netTotal: slice.netAmount,
        employerCostTotal: slice.employerCost,
        createdById: actorId,
        lineItems: {
          create: [
            {
              employeeId,
              compensationProfileId: line.profile.id,
              baseAmount: line.profile.baseAmount,
              allowancesTotal: slice.allowancesTotal,
              deductionsTotal: slice.deductionsTotal,
              grossAmount: slice.grossAmount,
              netAmount: slice.netAmount,
              taxableGross: slice.taxableGross,
              employerCost: slice.employerCost,
              currency: slice.currency,
              exchangeRate: slice.exchangeRate,
              netBaseAmount: slice.netAmount,
              components: {
                create: slice.components.map((component) => ({
                  name: component.name,
                  type: component.type,
                  calcMethod: component.calcMethod,
                  rateOrAmount: component.rateOrAmount,
                  amount: component.amount,
                  isTaxable: component.isTaxable,
                  statutoryKey: component.statutoryKey ?? undefined,
                  sequence: component.sequence,
                  basis: component.basis ?? undefined,
                })),
              },
            },
          ],
        },
      },
      select: { id: true, runNumber: true },
    });
    return { run, slice };
  }

  it("posts a BALANCED entry with statutory credits on their own accounts", async () => {
    const { run, slice } = await makeRun(1);

    const outcome = await postPayrollRun({
      companyId,
      runId: run.id,
      runNumber: run.runNumber,
      entryDate: new Date("2026-08-31T00:00:00.000Z"),
      createdById: actorId,
      enabledFeatures: ["accounting.core"],
    });
    expect(outcome.posted).toBe(true);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId, sourceId: run.id },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });

    const debit = entry.lines.reduce((sum, l) => sum + Number(l.debit ?? 0), 0);
    const credit = entry.lines.reduce((sum, l) => sum + Number(l.credit ?? 0), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.01);

    const byCode = new Map(
      entry.lines.map((l) => [l.account.code, Number(l.debit ?? 0) + Number(l.credit ?? 0)]),
    );

    // 2110 PAYE, 2130 AIDS levy, 2120 NSSA, 2140 ZIMDEF, 2160 SDL — the accounts
    // an accountant can point at and say "this is what we owe ZIMRA".
    expect(byCode.get("2110")).toBeCloseTo(Number(slice.paye), 2);
    expect(byCode.get("2130")).toBeCloseTo(Number(slice.aidsLevy), 2);
    expect(byCode.get("2100")).toBeCloseTo(Number(slice.netAmount), 2);
    expect(byCode.has("2120")).toBe(true);
    expect(byCode.has("2140")).toBe(true);

    // And NOT the inventory account payroll deductions used to land in.
    expect(byCode.has("2300")).toBe(false);
    // Nor generic Accounts Payable for net pay.
    expect(byCode.has("2000")).toBe(false);
  });

  it("debits the employer's contributions to their own expense account", async () => {
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId },
      include: { lines: { include: { account: { select: { code: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const employerLine = entry.lines.find((l) => l.account.code === "5210");
    expect(employerLine).toBeDefined();
    // 5210, not 5200 Wages — a business wanting its true cost of labour needs the
    // wage and the levies on it apart.
    expect(Number(employerLine!.debit ?? 0)).toBeGreaterThan(0);
  });

  it("posts exactly one entry per run, in base currency", async () => {
    // `JournalEntry` is unique on (companyId, sourceType, sourceId) and carries
    // no currency column, so a run cannot post one entry per currency. The
    // repo's convention — the reason `apportionBase` exists — is a base-currency
    // ledger, and payroll follows it: a ZWG line converts through the rate frozen
    // on that line when the run was computed.
    const run = await prisma.payrollRun.findFirstOrThrow({
      where: { companyId, runNumber: 1 },
      select: { id: true },
    });
    const entries = await prisma.journalEntry.count({
      where: { companyId, sourceId: run.id },
    });
    expect(entries).toBe(1);
  });

  it("COMPLETES without posting when there is no accounting module", async () => {
    // The payroll-only product. This must not throw, and must not claim to have
    // posted.
    const { run } = await makeRun(2);

    const outcome = await postPayrollRun({
      companyId,
      runId: run.id,
      runNumber: run.runNumber,
      entryDate: new Date("2026-08-31T00:00:00.000Z"),
      createdById: actorId,
      // No `accounting.core`.
      enabledFeatures: ["hr.payroll"],
    });

    expect(outcome.posted).toBe(false);
    if (!outcome.posted) {
      expect(outcome.reason).toContain("No accounting module");
    }

    // Nothing written for this run.
    const entries = await prisma.journalEntry.count({
      where: { companyId, sourceId: run.id },
    });
    expect(entries).toBe(0);
  });

  it("says so rather than throwing when a run has no lines", async () => {
    const empty = await prisma.payrollRun.create({
      data: {
        companyId,
        periodId,
        runNumber: 99,
        status: "APPROVED",
        createdById: actorId,
      },
      select: { id: true },
    });

    const outcome = await postPayrollRun({
      companyId,
      runId: empty.id,
      runNumber: 99,
      entryDate: new Date("2026-08-31T00:00:00.000Z"),
      createdById: actorId,
      enabledFeatures: ["accounting.core"],
    });

    expect(outcome.posted).toBe(false);
    if (!outcome.posted) expect(outcome.reason).toContain("no line items");
  });
});
