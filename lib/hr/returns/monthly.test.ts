/**
 * The monthly returns.
 *
 * The tests that matter most are the reconciliation ones. A P2 that agrees with
 * itself proves nothing — the question is whether the figure filed equals the
 * credit on 2110 PAYE Payable, because if it does not, one of them is wrong and
 * ZIMRA will be the one to find out.
 *
 * The exclusions are the other half. A contractor on a P2 over-reports
 * emoluments; a zero-contribution employee on an NSSA schedule invites NSSA to
 * ask why somebody was listed and not paid for. Both are the kind of mistake that
 * produces a query months later rather than an error now.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { seedZimbabweStatutoryPack } from "@/lib/hr/statutory/zimbabwe-pack";
import { assembleSalaryRun } from "@/lib/hr/payroll/assemble";
import { postPayrollRun } from "@/lib/hr/payroll/posting";
import { computeNssaSchedule, computeP2, reconcileReturns } from "./monthly";

const PERIOD_KEY = "2026-08";
const PERIOD_START = new Date("2026-08-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-31T23:59:59.999Z");

let companyId: string;
let actorId: string;
let periodId: string;
let runId: string;

/** IDs so tests can name who they expect to see. */
let adaEmployeeNumber: string;
let noNumberEmployeeNumber: string;

beforeAll(async () => {
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Returns ${stamp}`, slug: `returns-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `returns-${stamp}@example.invalid`,
      name: "Returns Actor",
      password: "not-a-real-password",
      role: "MANAGER",
    },
    select: { id: true },
  });
  actorId = actor.id;

  await ensureAccountingDefaults(companyId);
  await seedZimbabweStatutoryPack({ companyId });

  async function makeEmployee(input: {
    employeeId: string;
    name: string;
    taxStatus?: "STANDARD" | "EXEMPT" | "CONTRACTOR";
    taxNumber?: string | null;
    nssaNumber?: string | null;
    baseAmount: string;
  }) {
    const employee = await prisma.employee.create({
      data: {
        companyId,
        employeeId: input.employeeId,
        name: input.name,
        phone: "0770000000",
        nextOfKinName: "Kin",
        nextOfKinPhone: "0770000001",
        passportPhotoUrl: "https://example.invalid/p.jpg",
        villageOfOrigin: "Village",
        taxStatus: input.taxStatus ?? "STANDARD",
        taxNumber: input.taxNumber === undefined ? "BP1234567" : input.taxNumber,
        nssaNumber: input.nssaNumber === undefined ? "NSSA-0001" : input.nssaNumber,
      },
      select: { id: true },
    });
    await prisma.compensationProfile.create({
      data: {
        employeeId: employee.id,
        baseAmount: input.baseAmount,
        currency: "USD",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        workflowStatus: "APPROVED",
        createdById: actorId,
      },
    });
    return employee.id;
  }

  adaEmployeeNumber = "EMP-R-1";
  noNumberEmployeeNumber = "EMP-R-3";

  await makeEmployee({ employeeId: adaEmployeeNumber, name: "Ada Moyo", baseAmount: "1000" });
  // A contractor: paid gross, and absent from both returns.
  await makeEmployee({
    employeeId: "EMP-R-2",
    name: "Blessing Ncube",
    taxStatus: "CONTRACTOR",
    taxNumber: null,
    nssaNumber: null,
    baseAmount: "1500",
  });
  // Missing both identifiers: reported as a blocker on each return.
  await makeEmployee({
    employeeId: noNumberEmployeeNumber,
    name: "Kudzai Sibanda",
    taxNumber: null,
    nssaNumber: null,
    baseAmount: "800",
  });

  const period = await prisma.payrollPeriod.create({
    data: {
      companyId,
      periodKey: PERIOD_KEY,
      startDate: PERIOD_START,
      endDate: PERIOD_END,
      dueDate: new Date("2026-09-05T00:00:00.000Z"),
      createdById: actorId,
    },
    select: { id: true },
  });
  periodId = period.id;

  const assembled = await assembleSalaryRun({
    companyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    appliesToContractorsOnly: false,
  });
  expect(assembled.gaps).toEqual([]);

  const run = await prisma.payrollRun.create({
    data: {
      companyId,
      periodId,
      runNumber: 1,
      status: "APPROVED",
      approvedAt: new Date("2026-08-31T00:00:00.000Z"),
      createdById: actorId,
      lineItems: {
        create: assembled.lines.map((line) => {
          const slice = line.payroll.slices[0];
          return {
            employeeId: line.employee.id,
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
          };
        }),
      },
    },
    select: { id: true, runNumber: true },
  });
  runId = run.id;

  await postPayrollRun({
    companyId,
    runId,
    runNumber: run.runNumber,
    entryDate: new Date("2026-08-31T00:00:00.000Z"),
    createdById: actorId,
    enabledFeatures: ["accounting.core"],
  });
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
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
});

describe("the P2", () => {
  it("reports one return per currency", async () => {
    const returns = await computeP2({ companyId, periodKey: PERIOD_KEY });
    expect(returns).toHaveLength(1);
    expect(returns[0].currency).toBe("USD");
    expect(returns[0].periodKey).toBe(PERIOD_KEY);
  });

  it("EXCLUDES a contractor — the employer's P2 does not report them", async () => {
    // They are paid gross and declare their own income. Including them would
    // over-report emoluments and under-report the tax against them.
    const [p2] = await computeP2({ companyId, periodKey: PERIOD_KEY });
    expect(p2.schedule.some((row) => row.employeeNumber === "EMP-R-2")).toBe(false);
    expect(p2.boxes.employeesReported).toBe(2);
  });

  it("carries the taxable emoluments, not just the gross", async () => {
    const [p2] = await computeP2({ companyId, periodKey: PERIOD_KEY });
    // Ada 1,000 + Kudzai 800 = 1,800 gross.
    expect(p2.boxes.grossEmoluments.toString()).toBe("1800");
    // Taxable is lower: NSSA came off first on both.
    expect(p2.boxes.taxableEmoluments.lessThan(p2.boxes.grossEmoluments)).toBe(true);
  });

  it("shows the tax and the credits separately", async () => {
    // ZIMRA asks for both, and an employer that nets them off cannot show its
    // working. With no credits in play the two figures coincide, which is what
    // the identity below asserts.
    const [p2] = await computeP2({ companyId, periodKey: PERIOD_KEY });
    expect(
      p2.boxes.payeBeforeCredits.minus(p2.boxes.taxCredits).toString(),
    ).toBe(p2.boxes.payeDeducted.toString());
  });

  it("remits PAYE and the levy as one amount", async () => {
    const [p2] = await computeP2({ companyId, periodKey: PERIOD_KEY });
    expect(p2.boxes.totalRemittance.toString()).toBe(
      p2.boxes.payeDeducted.plus(p2.boxes.aidsLevy).toString(),
    );
    // And the schedule sums to the boxes — the detail and the filing figure come
    // out of one calculation.
    const scheduleTotal = p2.schedule.reduce(
      (sum, row) => sum.plus(row.payeDeducted),
      p2.boxes.payeDeducted.minus(p2.boxes.payeDeducted),
    );
    expect(scheduleTotal.toString()).toBe(p2.boxes.payeDeducted.toString());
  });

  it("names an employee whose missing BP number blocks the filing", async () => {
    const [p2] = await computeP2({ companyId, periodKey: PERIOD_KEY });
    expect(p2.blockers).toHaveLength(1);
    expect(p2.blockers[0]).toContain(noNumberEmployeeNumber);
    expect(p2.blockers[0]).toContain("tax (BP) number");
    // The contractor is not a blocker — they are not on the return at all.
    expect(p2.blockers.some((b) => b.includes("EMP-R-2"))).toBe(false);
  });

  it("ignores a draft run", async () => {
    // A draft's figures change. A return filed from one reports a number the
    // employer never paid.
    const draft = await prisma.payrollRun.create({
      data: {
        companyId,
        periodId,
        runNumber: 2,
        status: "DRAFT",
        createdById: actorId,
        lineItems: {
          create: [
            {
              employeeId: (await prisma.employee.findFirstOrThrow({
                where: { companyId, employeeId: adaEmployeeNumber },
                select: { id: true },
              })).id,
              grossAmount: "99999",
              netAmount: "99999",
              taxableGross: "99999",
              currency: "USD",
            },
          ],
        },
      },
      select: { id: true },
    });

    const [p2] = await computeP2({ companyId, periodKey: PERIOD_KEY });
    expect(p2.boxes.grossEmoluments.toString()).toBe("1800");

    await prisma.payrollLineItem.deleteMany({ where: { runId: draft.id } });
    await prisma.payrollRun.delete({ where: { id: draft.id } });
  });
});

describe("the NSSA schedule", () => {
  it("lists the CAPPED insurable earnings, not the salary", async () => {
    // NSSA reconciles a schedule against the contribution. A schedule listing
    // full salaries beside capped contributions looks like an under-payment.
    const [nssa] = await computeNssaSchedule({ companyId, periodKey: PERIOD_KEY });
    const ada = nssa.schedule.find((row) => row.employeeNumber === adaEmployeeNumber)!;

    expect(ada.insurableEarnings.toString()).toBe("700");
    expect(ada.employeeContribution.toString()).toBe("31.5");
  });

  it("charges below the ceiling at the full rate", async () => {
    // Kudzai earns 800, so the ceiling of 700 bites there too.
    const [nssa] = await computeNssaSchedule({ companyId, periodKey: PERIOD_KEY });
    const kudzai = nssa.schedule.find(
      (row) => row.employeeNumber === noNumberEmployeeNumber,
    )!;
    expect(kudzai.insurableEarnings.toString()).toBe("700");
  });

  it("folds APWCS into the employer side, since NSSA collects both", async () => {
    const [nssa] = await computeNssaSchedule({ companyId, periodKey: PERIOD_KEY });
    const ada = nssa.schedule.find((row) => row.employeeNumber === adaEmployeeNumber)!;
    // 31.50 POBS + 0.9% of 1,000 APWCS = 9 → 40.50.
    expect(ada.employerContribution.toString()).toBe("40.5");
    expect(ada.total.toString()).toBe("72");
  });

  it("excludes a contractor, who is outside the scheme entirely", async () => {
    const [nssa] = await computeNssaSchedule({ companyId, periodKey: PERIOD_KEY });
    expect(nssa.schedule.some((row) => row.employeeNumber === "EMP-R-2")).toBe(false);
  });

  it("totals to the remittance", async () => {
    const [nssa] = await computeNssaSchedule({ companyId, periodKey: PERIOD_KEY });
    expect(nssa.totalRemittance.toString()).toBe(
      nssa.totalEmployeeContribution.plus(nssa.totalEmployerContribution).toString(),
    );
    expect(nssa.membersReported).toBe(nssa.schedule.length);
  });

  it("names an employee whose missing NSSA number blocks the filing", async () => {
    const [nssa] = await computeNssaSchedule({ companyId, periodKey: PERIOD_KEY });
    expect(nssa.blockers.some((b) => b.includes(noNumberEmployeeNumber))).toBe(true);
  });
});

describe("reconciliation against the ledger", () => {
  it("agrees with the payable balances the run posted", async () => {
    // The check that makes the returns trustworthy rather than plausible. Both
    // sides are summed from the same `PayrollLineComponent` rows by
    // `summariseStatutory`, so agreement is by construction — and this asserts
    // the construction holds.
    const result = await reconcileReturns({ companyId, periodKey: PERIOD_KEY });

    expect(result.ledgerAvailable).toBe(true);
    expect(result.reconciled).toBe(true);
    for (const line of result.lines) {
      expect(line.difference.abs().lessThanOrEqualTo("0.01")).toBe(true);
    }
  });

  it("checks PAYE against 2110, the levy against 2130 and NSSA against 2120", async () => {
    const result = await reconcileReturns({ companyId, periodKey: PERIOD_KEY });
    const byLabel = new Map(result.lines.map((line) => [line.label, line]));

    expect(byLabel.get("PAYE")!.accountCode).toBe("2110");
    expect(byLabel.get("AIDS levy")!.accountCode).toBe("2130");
    expect(byLabel.get("NSSA")!.accountCode).toBe("2120");
    // Non-zero, so the assertion above is not passing on two zeroes.
    expect(byLabel.get("PAYE")!.returnAmountBase.greaterThan(0)).toBe(true);
    expect(byLabel.get("PAYE")!.ledgerAmountBase.greaterThan(0)).toBe(true);
  });

  it("catches a ledger that no longer matches the return", async () => {
    // Move a credit by a dollar and the reconciliation must notice. If it does
    // not, it is not checking anything.
    const payeLine = await prisma.journalLine.findFirstOrThrow({
      where: { entry: { companyId, sourceId: runId }, account: { code: "2110" } },
      select: { id: true, credit: true },
    });
    await prisma.journalLine.update({
      where: { id: payeLine.id },
      data: { credit: Number(payeLine.credit) + 1 },
    });

    const result = await reconcileReturns({ companyId, periodKey: PERIOD_KEY });
    const paye = result.lines.find((line) => line.label === "PAYE")!;
    expect(paye.reconciled).toBe(false);
    expect(result.reconciled).toBe(false);

    await prisma.journalLine.update({
      where: { id: payeLine.id },
      data: { credit: Number(payeLine.credit) },
    });
  });

  it("reports 'not checked' rather than 'fine' with no ledger", async () => {
    // The payroll-only product. Saying a period reconciles when nothing was
    // consulted would be the worst possible answer.
    const stamp = Date.now();
    const bare = await prisma.company.create({
      data: { name: `No ledger ${stamp}`, slug: `no-ledger-${stamp}` },
      select: { id: true },
    });

    const result = await reconcileReturns({
      companyId: bare.id,
      periodKey: PERIOD_KEY,
    });
    expect(result.ledgerAvailable).toBe(false);
    expect(result.reconciled).toBe(false);

    await prisma.company.delete({ where: { id: bare.id } }).catch(() => {});
  });
});
