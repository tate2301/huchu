/**
 * A payroll run, end to end, against a real Postgres.
 *
 * `engine.test.ts` proves the arithmetic against hand-worked figures with no
 * database at all. This file proves the plumbing: that the compensation
 * profiles, the rules, the attendance, the four statutory tables and the FX rate
 * are actually read, actually reach the engine, and that what comes back is what
 * a payslip and a P2 will be built from.
 *
 * The two halves matter separately. A mocked version of this would assert the
 * shape of the mocks — which is what the route's unit test used to do for the
 * salary path, and why the salary cases moved here.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { seedZimbabweStatutoryPack } from "../statutory/zimbabwe-pack";
import { assembleSalaryRun, findReturnBlockers } from "./assemble";
import { netIdentityHolds } from "./engine";

const PERIOD_START = new Date("2026-08-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-31T23:59:59.999Z");

let companyId: string;
let actorId: string;
let siteId: string;
let adaId: string;
let contractorId: string;

async function makeEmployee(input: {
  name: string;
  employeeId: string;
  taxStatus?: "STANDARD" | "EXEMPT" | "CONTRACTOR";
  defaultCurrency?: string;
  taxNumber?: string | null;
  nssaNumber?: string | null;
  overtimeHourlyRate?: string | null;
  dateOfBirth?: Date | null;
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
      defaultCurrency: input.defaultCurrency ?? "USD",
      taxStatus: input.taxStatus ?? "STANDARD",
      // `??` would be wrong here: a test passing `taxNumber: null` means
      // "deliberately missing", and `??` would helpfully substitute the default
      // and make the assertion pass for the wrong reason.
      taxNumber: input.taxNumber === undefined ? "BP1234567" : input.taxNumber,
      nssaNumber: input.nssaNumber === undefined ? "NSSA-0001" : input.nssaNumber,
      overtimeHourlyRate: input.overtimeHourlyRate ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
    },
    select: { id: true },
  });
  return employee.id;
}

async function giveProfile(employeeId: string, baseAmount: string, currency = "USD") {
  await prisma.compensationProfile.create({
    data: {
      employeeId,
      baseAmount,
      currency,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      status: "ACTIVE",
      workflowStatus: "APPROVED",
      createdById: actorId,
    },
  });
}

beforeAll(async () => {
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Payroll run ${stamp}`, slug: `payroll-run-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `payroll-run-${stamp}@example.invalid`,
      name: "Payroll Actor",
      password: "not-a-real-password",
      role: "MANAGER",
    },
    select: { id: true },
  });
  actorId = actor.id;

  const site = await prisma.site.create({
    data: { companyId, name: "Head Office", code: `HO-${stamp}`, location: "Harare" },
    select: { id: true },
  });
  siteId = site.id;

  await seedZimbabweStatutoryPack({ companyId });

  adaId = await makeEmployee({ name: "Ada Moyo", employeeId: "EMP-001" });
  await giveProfile(adaId, "1000");

  contractorId = await makeEmployee({
    name: "Blessing Ncube",
    employeeId: "EMP-002",
    taxStatus: "CONTRACTOR",
  });
  await giveProfile(contractorId, "1500");
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.attendance.deleteMany({ where: { employee: { companyId } } });
  await prisma.compensationProfile.deleteMany({ where: { employee: { companyId } } });
  await prisma.compensationRule.deleteMany({ where: { companyId } });
  await prisma.employee.deleteMany({ where: { companyId } });
  await prisma.payeTable.deleteMany({ where: { companyId } });
  await prisma.statutoryRate.deleteMany({ where: { companyId } });
  await prisma.taxCredit.deleteMany({ where: { companyId } });
  await prisma.necAgreement.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

function run(overrides: Partial<Parameters<typeof assembleSalaryRun>[0]> = {}) {
  return assembleSalaryRun({
    companyId,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    appliesToContractorsOnly: false,
    ...overrides,
  });
}

describe("a salary run reads what it needs and computes the statutory figures", () => {
  it("produces a line per employee with a full statutory breakdown", async () => {
    const result = await run();

    expect(result.gaps).toEqual([]);
    expect(result.baseCurrency).toBe("USD");
    expect(result.lines).toHaveLength(2);

    const ada = result.lines.find((line) => line.employee.id === adaId)!;
    const slice = ada.payroll.slices[0];

    // The same hand-worked figures as the pure engine test, now arrived at from
    // rows in a database rather than from literals: NSSA 31.50 on the capped
    // 700, taxable gross 968.50, PAYE 207.13, levy 6.21, net 755.16.
    expect(slice.grossAmount.toString()).toBe("1000");
    expect(slice.taxableGross.toString()).toBe("968.5");
    expect(slice.paye.toString()).toBe("207.13");
    expect(slice.aidsLevy.toString()).toBe("6.21");
    expect(slice.netAmount.toString()).toBe("755.16");
    expect(netIdentityHolds(slice)).toBe(true);
  });

  it("writes a component for every stage, keyed for the returns", async () => {
    const result = await run();
    const ada = result.lines.find((line) => line.employee.id === adaId)!;
    const keys = ada.payroll.slices[0].components
      .map((component) => component.statutoryKey)
      .filter(Boolean);

    // These keys are what a P2 and an NSSA schedule are summed over, so a
    // missing one is a return that under-reports.
    expect(keys).toContain("PAYE");
    expect(keys).toContain("AIDS_LEVY");
    expect(keys).toContain("NSSA_POBS_EMPLOYEE");
    expect(keys).toContain("NSSA_POBS_EMPLOYER");
    expect(keys).toContain("ZIMDEF");
  });

  it("collects the employer's own cost separately from the wage", async () => {
    const result = await run();
    const ada = result.lines.find((line) => line.employee.id === adaId)!;
    const slice = ada.payroll.slices[0];

    // Seeded pack: NSSA employer 31.50 + APWCS 0.9% of 1,000 = 9 + ZIMDEF 1% of
    // 1,000 = 10 + SDL 0.5% of 1,000 = 5.
    expect(slice.employerCost.toString()).toBe("55.5");
    // And none of it is in gross or net.
    expect(slice.grossAmount.toString()).toBe("1000");
    expect(slice.netAmount.toString()).toBe("755.16");
  });

  it("pays a contractor gross, withholding nothing", async () => {
    const result = await run();
    const contractor = result.lines.find((line) => line.employee.id === contractorId)!;
    const slice = contractor.payroll.slices[0];

    expect(slice.netAmount.toString()).toBe("1500");
    expect(slice.deductionsTotal.toString()).toBe("0");
  });

  it("skips an employee with no approved profile and says who", async () => {
    const orphanId = await makeEmployee({ name: "Tendai Zulu", employeeId: "EMP-003" });
    const result = await run();

    expect(result.lines.some((line) => line.employee.id === orphanId)).toBe(false);
    expect(result.warnings).toContain(
      "Tendai Zulu (EMP-003) skipped: no approved compensation profile.",
    );

    await prisma.employee.delete({ where: { id: orphanId } });
  });

  it("scopes to the employees a period names", async () => {
    const result = await run({ employeeScopeIds: [adaId] });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].employee.id).toBe(adaId);
  });
});

describe("Attendance.overtime finally reaches payroll", () => {
  it("pays banked overtime hours at the employee's hourly rate", async () => {
    // The hours have been captured since the module was written and payroll had
    // never once queried them — so an employee who worked a Saturday was paid as
    // though they had not.
    const overtimeId = await makeEmployee({
      name: "Rudo Chari",
      employeeId: "EMP-OT1",
      overtimeHourlyRate: "8.50",
    });
    await giveProfile(overtimeId, "1000");

    await prisma.attendance.createMany({
      data: [
        {
          employeeId: overtimeId,
          companyId,
          siteId,
          date: new Date("2026-08-08T00:00:00.000Z"),
          shift: "DAY",
          status: "PRESENT",
          overtime: 4,
        },
        {
          employeeId: overtimeId,
          companyId,
          siteId,
          date: new Date("2026-08-15T00:00:00.000Z"),
          shift: "DAY",
          status: "PRESENT",
          overtime: 2.5,
        },
      ],
    });

    const result = await run({ employeeScopeIds: [overtimeId] });
    const slice = result.lines[0].payroll.slices[0];

    // 6.5 hours at 8.50 = 55.25, on top of the 1,000 basic.
    const overtimeComponent = slice.components.find((c) => c.name === "Overtime");
    expect(overtimeComponent?.amount.toString()).toBe("55.25");
    expect(slice.grossAmount.toString()).toBe("1055.25");
    // Taxable, so it moves the tax too: 1055.25 − 31.50 = 1023.75 taxable gross,
    // which crosses into the 30% band.
    expect(slice.taxableGross.toString()).toBe("1023.75");

    await prisma.attendance.deleteMany({ where: { employeeId: overtimeId } });
    await prisma.compensationProfile.deleteMany({ where: { employeeId: overtimeId } });
    await prisma.employee.delete({ where: { id: overtimeId } });
  });

  it("ignores overtime hours for an employee with no hourly rate", async () => {
    // Some contracts bank overtime as leave. Paying it at a guessed rate would
    // be worse than not paying it.
    const noRateId = await makeEmployee({ name: "Farai Dube", employeeId: "EMP-OT2" });
    await giveProfile(noRateId, "1000");
    await prisma.attendance.create({
      data: {
        employeeId: noRateId,
        companyId,
        siteId,
        date: new Date("2026-08-08T00:00:00.000Z"),
        shift: "DAY",
        status: "PRESENT",
        overtime: 10,
      },
    });

    const result = await run({ employeeScopeIds: [noRateId] });
    expect(result.lines[0].payroll.slices[0].grossAmount.toString()).toBe("1000");

    await prisma.attendance.deleteMany({ where: { employeeId: noRateId } });
    await prisma.compensationProfile.deleteMany({ where: { employeeId: noRateId } });
    await prisma.employee.delete({ where: { id: noRateId } });
  });

  it("ignores overtime outside the pay period", async () => {
    const spillId = await makeEmployee({
      name: "Nyasha Banda",
      employeeId: "EMP-OT3",
      overtimeHourlyRate: "10",
    });
    await giveProfile(spillId, "1000");
    await prisma.attendance.create({
      data: {
        employeeId: spillId,
        companyId,
        siteId,
        date: new Date("2026-09-05T00:00:00.000Z"),
        shift: "DAY",
        status: "PRESENT",
        overtime: 8,
      },
    });

    const result = await run({ employeeScopeIds: [spillId] });
    expect(result.lines[0].payroll.slices[0].grossAmount.toString()).toBe("1000");

    await prisma.attendance.deleteMany({ where: { employeeId: spillId } });
    await prisma.compensationProfile.deleteMany({ where: { employeeId: spillId } });
    await prisma.employee.delete({ where: { id: spillId } });
  });
});

describe("compensation rules", () => {
  it("applies a taxable allowance and a pre-tax pension differently", async () => {
    const allowance = await prisma.compensationRule.create({
      data: {
        companyId,
        name: "Housing allowance",
        type: "ALLOWANCE",
        calcMethod: "FIXED",
        value: "200",
        taxable: true,
        currency: "USD",
        isActive: true,
        workflowStatus: "APPROVED",
        employeeId: adaId,
        createdById: actorId,
      },
      select: { id: true },
    });
    const pension = await prisma.compensationRule.create({
      data: {
        companyId,
        name: "Pension",
        type: "DEDUCTION",
        calcMethod: "PERCENT",
        value: "5",
        taxable: false,
        currency: "USD",
        isActive: true,
        workflowStatus: "APPROVED",
        employeeId: adaId,
        // The marker that puts this deduction before PAYE rather than after.
        statutoryKey: "PENSION",
        createdById: actorId,
      },
      select: { id: true },
    });

    const result = await run({ employeeScopeIds: [adaId] });
    const slice = result.lines[0].payroll.slices[0];

    // Gross 1,200. NSSA on insurable 1,200 capped at 700 = 31.50.
    // Pension is 5% of the 1,000 basic = 50, and comes off before tax.
    // Taxable gross = 1,200 − 31.50 − 50 = 1,118.50.
    expect(slice.grossAmount.toString()).toBe("1200");
    expect(slice.taxableGross.toString()).toBe("1118.5");
    expect(netIdentityHolds(slice)).toBe(true);

    await prisma.compensationRule.delete({ where: { id: allowance.id } });
    await prisma.compensationRule.delete({ where: { id: pension.id } });
  });

  it("ignores a rule denominated in another currency", async () => {
    // `computeLineTotals` used to add a USD allowance to a ZWG wage without
    // comment. A rule in the wrong currency now simply does not apply.
    const zwgRule = await prisma.compensationRule.create({
      data: {
        companyId,
        name: "ZWG transport",
        type: "ALLOWANCE",
        calcMethod: "FIXED",
        value: "5000",
        taxable: true,
        currency: "ZWG",
        isActive: true,
        workflowStatus: "APPROVED",
        employeeId: adaId,
        createdById: actorId,
      },
      select: { id: true },
    });

    const result = await run({ employeeScopeIds: [adaId] });
    expect(result.lines[0].payroll.slices[0].grossAmount.toString()).toBe("1000");

    await prisma.compensationRule.delete({ where: { id: zwgRule.id } });
  });

  it("does not let a company's own PAYE rule charge PAYE twice", async () => {
    // A company that wrote its own statutory rule would otherwise have it
    // applied on top of the engine's.
    const homeMade = await prisma.compensationRule.create({
      data: {
        companyId,
        name: "Our own PAYE",
        type: "STATUTORY_DEDUCTION",
        calcMethod: "PERCENT",
        value: "25",
        currency: "USD",
        isActive: true,
        workflowStatus: "APPROVED",
        employeeId: adaId,
        createdById: actorId,
      },
      select: { id: true },
    });

    const result = await run({ employeeScopeIds: [adaId] });
    // Unchanged from the plain case.
    expect(result.lines[0].payroll.slices[0].netAmount.toString()).toBe("755.16");

    await prisma.compensationRule.delete({ where: { id: homeMade.id } });
  });

  it("gives the medical aid credit from the employee's own contribution", async () => {
    const medical = await prisma.compensationRule.create({
      data: {
        companyId,
        name: "Medical aid",
        type: "DEDUCTION",
        calcMethod: "FIXED",
        value: "120",
        currency: "USD",
        isActive: true,
        workflowStatus: "APPROVED",
        employeeId: adaId,
        statutoryKey: "MEDICAL_AID_CONTRIBUTION",
        createdById: actorId,
      },
      select: { id: true },
    });

    const result = await run({ employeeScopeIds: [adaId] });
    const slice = result.lines[0].payroll.slices[0];

    // Pre-tax 120: taxable gross = 1,000 − 31.50 − 120 = 848.50.
    // PAYE = 848.50 × 25% − 35 = 212.13 − 35 = 177.13.
    // Credit = 50% of the 120 contribution = 60, so tax payable is 117.13,
    // and the levy is 3% of THAT = 3.51.
    expect(slice.taxableGross.toString()).toBe("848.5");
    expect(slice.paye.toString()).toBe("117.13");
    expect(slice.aidsLevy.toString()).toBe("3.51");

    await prisma.compensationRule.delete({ where: { id: medical.id } });
  });
});

describe("the run refuses rather than guessing", () => {
  it("reports every statutory gap when the period is not covered", async () => {
    // December 2025 predates the seeded pack. The employee needs a profile that
    // is live in that month, or there is nothing to pay and the gaps are moot.
    const earlyId = await makeEmployee({ name: "Chipo Nyoni", employeeId: "EMP-EARLY" });
    await prisma.compensationProfile.create({
      data: {
        employeeId: earlyId,
        baseAmount: "1000",
        currency: "USD",
        effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        workflowStatus: "APPROVED",
        createdById: actorId,
      },
    });

    const result = await assembleSalaryRun({
      companyId,
      periodStart: new Date("2025-12-01T00:00:00.000Z"),
      periodEnd: new Date("2025-12-31T23:59:59.999Z"),
      employeeScopeIds: [earlyId],
      appliesToContractorsOnly: false,
    });

    expect(result.lines).toEqual([]);
    expect(result.gaps).toContain("No PAYE table covers December 2025 for USD");
    expect(result.gaps).toContain(
      "No NSSA employee rate covers December 2025 for USD",
    );
    expect(result.gaps).toContain("No AIDS levy rate covers December 2025");

    await prisma.compensationProfile.deleteMany({ where: { employeeId: earlyId } });
    await prisma.employee.delete({ where: { id: earlyId } });
  });

  it("says the profiles are missing rather than burying it under statutory noise", async () => {
    // Nobody has a profile live in 2029, so there is nothing to pay. Reporting
    // "no AIDS levy rate for 2029" would be true and useless.
    const result = await assembleSalaryRun({
      companyId,
      periodStart: new Date("2024-01-01T00:00:00.000Z"),
      periodEnd: new Date("2024-01-31T23:59:59.999Z"),
      appliesToContractorsOnly: false,
    });

    expect(result.gaps).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.warnings.some((w) => w.includes("no approved compensation profile"))).toBe(
      true,
    );
  });
});

describe("findReturnBlockers", () => {
  it("names an employee whose BP number would block the P2", async () => {
    const noTaxId = await makeEmployee({
      name: "Kudzai Sibanda",
      employeeId: "EMP-NOTAX",
      taxNumber: null,
    });

    const blockers = await findReturnBlockers({
      companyId,
      employeeIds: [noTaxId, adaId],
    });
    expect(blockers).toContain(
      "Kudzai Sibanda (EMP-NOTAX) has no tax (BP) number — the P2 cannot report them.",
    );
    // Ada has both numbers, so she is not named.
    expect(blockers.some((blocker) => blocker.includes("EMP-001"))).toBe(false);

    await prisma.employee.delete({ where: { id: noTaxId } });
  });

  it("does not ask a contractor for a BP number", async () => {
    // A contractor declares their own income; the employer's P2 does not report
    // them, so a missing number is not a blocker.
    const blockers = await findReturnBlockers({
      companyId,
      employeeIds: [contractorId],
    });
    expect(blockers).toEqual([]);
  });
});

describe("dual currency, against real rows", () => {
  it("taxes each currency on its own table and shares one NSSA ceiling", async () => {
    // A ZWG employee needs a rate on file, or the run stops — which is the
    // behaviour, not a gap in the test.
    await prisma.currencyRate.create({
      data: {
        companyId,
        baseCurrency: "USD",
        quoteCurrency: "ZWG",
        rate: 27.5,
        effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
      },
    });

    const zwgId = await makeEmployee({
      name: "Tapiwa Gumbo",
      employeeId: "EMP-ZWG",
      defaultCurrency: "ZWG",
    });
    await giveProfile(zwgId, "27500", "ZWG");

    const result = await run({ employeeScopeIds: [zwgId] });
    const slice = result.lines[0].payroll.slices[0];

    expect(slice.currency).toBe("ZWG");
    expect(slice.exchangeRate.toString()).toBe("27.5");
    expect(slice.grossAmount.toString()).toBe("27500");

    // 27,500 ZWG is 1,000 USD, so the single USD ceiling of 700 bites: NSSA is
    // 4.5% of 700 = 31.50 USD = 866.25 ZWG.
    const nssa = slice.components.find((c) => c.statutoryKey === "NSSA_POBS_EMPLOYEE");
    expect(nssa?.amount.toString()).toBe("866.25");

    // Taxed on the ZWG table — 26,633.75 taxable falls in its 25% band —
    // not on a converted USD figure.
    expect(slice.taxableGross.toString()).toBe("26633.75");
    expect(slice.paye.toString()).toBe("5678.44");
    expect(netIdentityHolds(slice)).toBe(true);

    await prisma.compensationProfile.deleteMany({ where: { employeeId: zwgId } });
    await prisma.employee.delete({ where: { id: zwgId } });
    await prisma.currencyRate.deleteMany({ where: { companyId } });
  });

  it("stops when a ZWG employee has no exchange rate on file", async () => {
    const zwgId = await makeEmployee({
      name: "Ropafadzo Moyo",
      employeeId: "EMP-ZWG2",
      defaultCurrency: "ZWG",
    });
    await giveProfile(zwgId, "27500", "ZWG");

    // No `CurrencyRate` row — so paying this employee would mean inventing a
    // rate, and `resolveExchangeRate` throws instead.
    await expect(run({ employeeScopeIds: [zwgId] })).rejects.toThrow(
      /exchange rate has been set/,
    );

    await prisma.compensationProfile.deleteMany({ where: { employeeId: zwgId } });
    await prisma.employee.delete({ where: { id: zwgId } });
  });
});

describe("the elderly credit turns on age", () => {
  it("applies to an employee over the qualifying age", async () => {
    const elderId = await makeEmployee({
      name: "Sekuru Marufu",
      employeeId: "EMP-ELDER",
      dateOfBirth: new Date("1960-01-01T00:00:00.000Z"),
    });
    await giveProfile(elderId, "1000");

    const result = await run({ employeeScopeIds: [elderId] });
    const slice = result.lines[0].payroll.slices[0];

    // PAYE 207.13 less the seeded 75 credit = 132.13, and the levy follows on
    // the reduced figure: 3% of 132.13 = 3.96.
    expect(slice.paye.toString()).toBe("132.13");
    expect(slice.aidsLevy.toString()).toBe("3.96");

    await prisma.compensationProfile.deleteMany({ where: { employeeId: elderId } });
    await prisma.employee.delete({ where: { id: elderId } });
  });

  it("does not apply to a younger employee", async () => {
    const youngId = await makeEmployee({
      name: "Panashe Moyo",
      employeeId: "EMP-YOUNG",
      dateOfBirth: new Date("1995-01-01T00:00:00.000Z"),
    });
    await giveProfile(youngId, "1000");

    const result = await run({ employeeScopeIds: [youngId] });
    expect(result.lines[0].payroll.slices[0].paye.toString()).toBe("207.13");

    await prisma.compensationProfile.deleteMany({ where: { employeeId: youngId } });
    await prisma.employee.delete({ where: { id: youngId } });
  });
});
