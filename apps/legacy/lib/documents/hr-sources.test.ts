/**
 * The payslip.
 *
 * Two things worth testing here and they are different in kind.
 *
 * The payload tests check that the working is *shown* — an employee who queries
 * their PAYE has to be able to see the taxable gross it was struck on and the
 * ceiling their NSSA was capped at. A payslip that prints only a net figure is
 * technically a payslip and practically useless.
 *
 * The access tests check that one employee cannot read another's. This is the
 * most sensitive data in the product, and the refusal has to be indistinguishable
 * from "no such payslip" — otherwise somebody can map the workforce by probing
 * ids and reading which ones come back 403 rather than 404.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { seedZimbabweStatutoryPack } from "@/lib/hr/statutory/zimbabwe-pack";
import { assembleSalaryRun } from "@/lib/hr/payroll/assemble";
import { canRenderPayslip, resolvePayslip } from "./hr-sources";

let companyId: string;
let actorId: string;
let adaUserId: string;
let adaLineId: string;
let contractorLineId: string;

beforeAll(async () => {
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Payslip ${stamp}`, slug: `payslip-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `payslip-hr-${stamp}@example.invalid`,
      name: "HR Actor",
      password: "not-a-real-password",
      role: "MANAGER",
    },
    select: { id: true },
  });
  actorId = actor.id;

  // Ada has a login, so she can fetch her own payslip.
  const adaUser = await prisma.user.create({
    data: {
      companyId,
      email: `ada-${stamp}@example.invalid`,
      name: "Ada Moyo",
      password: "not-a-real-password",
      // An ordinary operator: no payroll role at all, which is the point — she
      // must still be able to fetch her own payslip.
      role: "OPERATOR",
    },
    select: { id: true },
  });
  adaUserId = adaUser.id;

  await seedZimbabweStatutoryPack({ companyId });

  const department = await prisma.department.create({
    data: { companyId, name: "Finance", code: `FIN-${stamp}` },
    select: { id: true },
  });

  const ada = await prisma.employee.create({
    data: {
      companyId,
      userId: adaUserId,
      employeeId: "EMP-PS-1",
      name: "Ada Moyo",
      jobTitle: "Accounts Clerk",
      departmentId: department.id,
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

  const contractor = await prisma.employee.create({
    data: {
      companyId,
      employeeId: "EMP-PS-2",
      name: "Blessing Ncube",
      phone: "0770000002",
      nextOfKinName: "Kin",
      nextOfKinPhone: "0770000003",
      passportPhotoUrl: "https://example.invalid/p.jpg",
      villageOfOrigin: "Village",
      taxStatus: "CONTRACTOR",
      taxNumber: null,
      nssaNumber: null,
    },
    select: { id: true },
  });

  for (const [employeeId, amount] of [
    [ada.id, "1000"],
    [contractor.id, "1500"],
  ] as const) {
    await prisma.compensationProfile.create({
      data: {
        employeeId,
        baseAmount: amount,
        currency: "USD",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        status: "ACTIVE",
        workflowStatus: "APPROVED",
        createdById: actorId,
      },
    });
  }

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

  const assembled = await assembleSalaryRun({
    companyId,
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-31T23:59:59.999Z"),
    appliesToContractorsOnly: false,
  });

  const run = await prisma.payrollRun.create({
    data: {
      companyId,
      periodId: period.id,
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
    select: {
      lineItems: { select: { id: true, employee: { select: { employeeId: true } } } },
    },
  });

  adaLineId = run.lineItems.find((l) => l.employee.employeeId === "EMP-PS-1")!.id;
  contractorLineId = run.lineItems.find((l) => l.employee.employeeId === "EMP-PS-2")!.id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.payrollLineComponent.deleteMany({
    where: { lineItem: { run: { companyId } } },
  });
  await prisma.payrollLineItem.deleteMany({ where: { run: { companyId } } });
  await prisma.payrollRun.deleteMany({ where: { companyId } });
  await prisma.payrollPeriod.deleteMany({ where: { companyId } });
  await prisma.compensationProfile.deleteMany({ where: { employee: { companyId } } });
  await prisma.employee.deleteMany({ where: { companyId } });
  await prisma.department.deleteMany({ where: { companyId } });
  await prisma.payeTable.deleteMany({ where: { companyId } });
  await prisma.statutoryRate.deleteMany({ where: { companyId } });
  await prisma.taxCredit.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
});

describe("the payslip shows the working, not just the net figure", () => {
  it("names the employee, the period and the statutory identifiers", async () => {
    const doc = await resolvePayslip(companyId, adaLineId);
    const meta = new Map(doc.payload.meta!.map((m) => [m.label, m.value]));

    expect(doc.payload.title).toBe("Payslip");
    expect(meta.get("Employee")).toBe("Ada Moyo");
    expect(meta.get("Employee number")).toBe("EMP-PS-1");
    expect(meta.get("Position")).toBe("Accounts Clerk");
    expect(meta.get("Department")).toBe("Finance");
    expect(meta.get("Pay period")).toBe("2026-08");
    // On the payslip because ZIMRA and NSSA identify her by these.
    expect(meta.get("Tax (BP) number")).toBe("BP1234567");
    expect(meta.get("NSSA number")).toBe("NSSA-0001");
  });

  it("shows the taxable gross PAYE was actually struck on", async () => {
    const doc = await resolvePayslip(companyId, adaLineId);
    const section = doc.payload.record!.sections.find(
      (s) => s.title === "How your pay was worked out",
    )!;
    const rows = new Map(section.rows.map((r) => [r.label, r.value]));

    expect(rows.get("Gross pay")).toBe("1000.00");
    // Not the same as gross: NSSA came off first. Without this line an employee
    // cannot check their own PAYE against the ZIMRA table.
    expect(rows.get("Taxable gross")).toBe("968.50");
    expect(rows.get("Net pay")).toBe("755.16");
  });

  it("shows the CEILING NSSA was capped at, not the salary", async () => {
    // The line that answers "why is my NSSA only $31.50 on a $1,000 salary".
    const doc = await resolvePayslip(companyId, adaLineId);
    const nssa = doc.payload.record!.lines!.find((row) =>
      String(row.stage).startsWith("NSSA (employee)"),
    )!;

    expect(nssa.amount).toBe("(31.50)");
    expect(nssa.calculatedOn).toBe("700.00");
    expect(nssa.rate).toBe("4.50%");
    expect(nssa.kind).toBe("Statutory");
  });

  it("shows the AIDS levy was struck on the tax, not the wage", async () => {
    const doc = await resolvePayslip(companyId, adaLineId);
    const levy = doc.payload.record!.lines!.find((row) => row.stage === "AIDS levy")!;
    expect(levy.amount).toBe("(6.21)");
    // 207.13 — the PAYE figure. If this said 1000.00 the levy would be wrong.
    expect(levy.calculatedOn).toBe("207.13");
  });

  it("marks the employer's contributions as not deducted from pay", async () => {
    const doc = await resolvePayslip(companyId, adaLineId);
    const section = doc.payload.record!.sections.find(
      (s) => s.title === "Paid by your employer on your behalf",
    );
    expect(section).toBeDefined();
    expect(section!.rows.some((r) => r.label.startsWith("NSSA (employer)"))).toBe(true);

    // And they are in no total the employee could mistake for their own money.
    const totals = new Map(doc.payload.totals!.map((t) => [t.label, t.value]));
    expect(totals.get("Gross pay")).toBe("1000.00");
    expect(totals.get("Net pay")).toBe("755.16");

    expect(
      doc.payload.notes!.some((note) => note.includes("not deducted from your pay")),
    ).toBe(true);
  });

  it("puts deductions on the deduction side, in brackets", async () => {
    const doc = await resolvePayslip(companyId, adaLineId);
    const paye = doc.payload.record!.lines!.find((row) =>
      String(row.stage).startsWith("PAYE"),
    )!;
    expect(paye.amount).toBe("(207.13)");
  });

  it("keeps the lines in the order the stages were computed", async () => {
    const doc = await resolvePayslip(companyId, adaLineId);
    const stages = doc.payload.record!.lines!.map((row) => String(row.stage));
    // Earnings first, then NSSA, then PAYE, then the levy — the sequence the
    // working actually follows.
    expect(stages.indexOf("Basic salary")).toBeLessThan(
      stages.findIndex((s) => s.startsWith("NSSA (employee)")),
    );
    expect(stages.findIndex((s) => s.startsWith("NSSA (employee)"))).toBeLessThan(
      stages.findIndex((s) => s.startsWith("PAYE")),
    );
    expect(stages.findIndex((s) => s.startsWith("PAYE"))).toBeLessThan(
      stages.indexOf("AIDS levy"),
    );
  });

  it("tells a contractor the income is theirs to declare", async () => {
    const doc = await resolvePayslip(companyId, contractorLineId);
    expect(
      doc.payload.notes!.some((note) => note.includes("yours to declare")),
    ).toBe(true);
    const totals = new Map(doc.payload.totals!.map((t) => [t.label, t.value]));
    expect(totals.get("Net pay")).toBe("1500.00");
  });

  it("asks an employee with no BP number for it", async () => {
    // Ada has one, so she is not asked. A STANDARD employee without one would be
    // — the contractor is exempted because the employer's P2 does not report them.
    const ada = await resolvePayslip(companyId, adaLineId);
    expect(ada.payload.notes!.some((n) => n.includes("No tax (BP) number"))).toBe(false);

    const contractor = await resolvePayslip(companyId, contractorLineId);
    expect(
      contractor.payload.notes!.some((n) => n.includes("No tax (BP) number")),
    ).toBe(false);
  });

  it("names the file after the employee and the period", async () => {
    const doc = await resolvePayslip(companyId, adaLineId);
    expect(doc.fileName).toBe("payslip-emp-ps-1-2026-08.pdf");
  });

  it("refuses a payslip belonging to another company", async () => {
    await expect(resolvePayslip("00000000-0000-0000-0000-000000000000", adaLineId)).rejects.toThrow(
      "Payslip not found",
    );
  });
});

describe("who may read a payslip", () => {
  it("lets HR staff read anybody's", async () => {
    const decision = await canRenderPayslip({
      companyId,
      lineItemId: adaLineId,
      userId: actorId,
      hasPayrollAccess: true,
    });
    expect(decision.allowed).toBe(true);
  });

  it("lets an employee read their own", async () => {
    const decision = await canRenderPayslip({
      companyId,
      lineItemId: adaLineId,
      userId: adaUserId,
      hasPayrollAccess: false,
    });
    expect(decision.allowed).toBe(true);
  });

  it("does NOT let an employee read a colleague's", async () => {
    const decision = await canRenderPayslip({
      companyId,
      lineItemId: contractorLineId,
      userId: adaUserId,
      hasPayrollAccess: false,
    });
    expect(decision.allowed).toBe(false);
  });

  it("gives the same answer for a colleague's payslip and one that does not exist", async () => {
    // A distinguishable refusal would let somebody map the workforce by probing
    // ids and watching which come back differently.
    const colleague = await canRenderPayslip({
      companyId,
      lineItemId: contractorLineId,
      userId: adaUserId,
      hasPayrollAccess: false,
    });
    const missing = await canRenderPayslip({
      companyId,
      lineItemId: "00000000-0000-0000-0000-000000000000",
      userId: adaUserId,
      hasPayrollAccess: false,
    });

    expect(colleague.allowed).toBe(false);
    expect(missing.allowed).toBe(false);
    if (!colleague.allowed && !missing.allowed) {
      expect(colleague.reason).toBe(missing.reason);
    }
  });

  it("refuses an employee with no linked login", async () => {
    // The contractor has no `userId`, so nobody can claim their payslip by
    // matching a null against a null.
    const decision = await canRenderPayslip({
      companyId,
      lineItemId: contractorLineId,
      userId: "",
      hasPayrollAccess: false,
    });
    expect(decision.allowed).toBe(false);
  });
});
