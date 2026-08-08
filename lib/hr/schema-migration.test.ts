/**
 * Migration witnesses for the HR `Float` → `Decimal` conversion.
 *
 * Required by `CONTRIBUTING.md`: a P0 migration ships with a witness test in
 * the same commit. Every money column in HR was a `double precision` and each
 * route rounded it with its own local helper — the same mistake the school fee
 * surface made before S-2.1, where `Math.round((v + Number.EPSILON) * 100) / 100`
 * turned 8.575 into 8.57 and a bursar's tin disagreed with the ledger.
 *
 * These tests assert the *storage*, not the arithmetic: that the columns are
 * `numeric` at the scale claimed, and that a value with a hostile third decimal
 * survives a write-and-read with the cent a person would count. They run against
 * a real Postgres — a mock cannot tell you what a column did with your number,
 * which is the entire question.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ColumnFacts = {
  data_type: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
};

async function columnFacts(table: string, column: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows[0] ?? null;
}

/** Every HR money column, with the scale it is meant to carry. */
const MONEY_COLUMNS: Array<[table: string, column: string, scale: number]> = [
  ["CompensationProfile", "baseAmount", 2],
  ["CompensationRule", "value", 4],
  ["CompensationRule", "cap", 2],
  ["PayrollRun", "grossTotal", 2],
  ["PayrollRun", "allowancesTotal", 2],
  ["PayrollRun", "deductionsTotal", 2],
  ["PayrollRun", "netTotal", 2],
  ["PayrollRun", "employerCostTotal", 2],
  // Scale 4, not 2 — the gold settlement path overloads this to carry grams.
  ["PayrollLineItem", "baseAmount", 2],
  ["PayrollLineItem", "variableAmount", 2],
  ["PayrollLineItem", "allowancesTotal", 2],
  ["PayrollLineItem", "deductionsTotal", 2],
  ["PayrollLineItem", "grossAmount", 2],
  ["PayrollLineItem", "netAmount", 2],
  ["PayrollLineItem", "taxableGross", 2],
  ["PayrollLineItem", "employerCost", 2],
  ["PayrollLineItem", "netBaseAmount", 2],
  ["PayrollLineComponent", "rateOrAmount", 4],
  ["PayrollLineComponent", "amount", 2],
  ["PayrollLineComponent", "basis", 2],
  ["DisbursementBatch", "totalAmount", 2],
  ["DisbursementItem", "amount", 2],
  ["DisbursementItem", "paidAmount", 2],
  ["DisbursementItem", "baseAmount", 2],
  ["AdjustmentEntry", "amountDelta", 2],
  ["EmployeePayment", "amount", 2],
  ["EmployeePayment", "paidAmount", 2],
  ["SettlementLine", "grossAmount", 2],
  ["SettlementLine", "netAmount", 2],
  ["SettlementBatch", "totalAmount", 2],
  ["SettlementBatchItem", "amount", 2],
];

/** Exchange rates, which need four places to be worth stamping at all. */
const RATE_COLUMNS: Array<[table: string, column: string]> = [
  ["PayrollLineItem", "exchangeRate"],
  ["DisbursementItem", "exchangeRate"],
];

describe("HR money columns are numeric, not double precision", () => {
  it.each(MONEY_COLUMNS)("%s.%s is numeric with scale %i", async (table, column, scale) => {
    const facts = await columnFacts(table, column);
    expect(facts, `${table}.${column} is missing`).not.toBeNull();
    expect(facts!.data_type).toBe("numeric");
    expect(facts!.numeric_scale).toBe(scale);
  });

  it.each(RATE_COLUMNS)("%s.%s is numeric(12,4)", async (table, column) => {
    const facts = await columnFacts(table, column);
    expect(facts, `${table}.${column} is missing`).not.toBeNull();
    expect(facts!.data_type).toBe("numeric");
    expect(facts!.numeric_precision).toBe(12);
    expect(facts!.numeric_scale).toBe(4);
  });
});

describe("Employee carries the statutory identity a Zimbabwean return needs", () => {
  // ZIMRA files against a BP number and NSSA against a membership number.
  // Without these two columns neither the P2 nor the NSSA schedule can name
  // the person it is reporting.
  it.each([
    "taxNumber",
    "nssaNumber",
    "taxStatus",
    "bankName",
    "bankAccountNumber",
    "bankBranchCode",
    "mobileMoneyProvider",
    "mobileMoneyNumber",
  ])("Employee.%s exists", async (column) => {
    const facts = await columnFacts("Employee", column);
    expect(facts, `Employee.${column} is missing`).not.toBeNull();
  });
});

describe("a hostile third decimal survives the round trip", () => {
  let companyId: string;
  let employeeId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const company = await prisma.company.create({
      data: {
        name: `HR decimal witness ${stamp}`,
        slug: `hr-decimal-witness-${stamp}`,
      },
      select: { id: true },
    });
    companyId = company.id;

    const employee = await prisma.employee.create({
      data: {
        companyId,
        employeeId: `WIT-${stamp}`,
        name: "Witness Employee",
        phone: "0770000000",
        nextOfKinName: "Next Of Kin",
        nextOfKinPhone: "0770000001",
        passportPhotoUrl: "https://example.invalid/photo.jpg",
        villageOfOrigin: "Witness Village",
      },
      select: { id: true },
    });
    employeeId = employee.id;
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.compensationProfile.deleteMany({ where: { employeeId } });
    await prisma.employee.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  it("stores 8.575 as 8.58, the cent a person would count", async () => {
    // The value that exposed the old rounder: 8.575 is not representable in
    // binary, so `Math.round((8.575 + Number.EPSILON) * 100) / 100` returned
    // 8.57. Postgres `numeric` rounds half away from zero and returns 8.58.
    const actor = await prisma.user.create({
      data: {
        companyId,
        email: `witness-${Date.now()}@example.invalid`,
        name: "Witness Actor",
        password: "not-a-real-password",
        role: "MANAGER",
      },
      select: { id: true },
    });

    const profile = await prisma.compensationProfile.create({
      data: {
        employeeId,
        baseAmount: new Prisma.Decimal("8.575"),
        currency: "USD",
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        createdById: actor.id,
      },
      select: { id: true, baseAmount: true },
    });

    expect(profile.baseAmount.toString()).toBe("8.58");

    const reread = await prisma.compensationProfile.findUniqueOrThrow({
      where: { id: profile.id },
      select: { baseAmount: true },
    });
    expect(reread.baseAmount.toString()).toBe("8.58");
  });

  it("PayrollLineItem.baseAmount is money, and grams live on the settlement line", async () => {
    // The inverse of what this asserted before. `baseAmount` was
    // `Decimal(14,4)` because a gold payout overloaded it to carry a weight in
    // grams — two places would have rounded 12.3456 g to 12.35 g and paid for
    // metal that was never poured. The overload is gone: it is basic pay, at
    // money's scale, and a weight is `SettlementLine.quantity`.
    const line = await columnFacts("PayrollLineItem", "baseAmount");
    expect(line!.numeric_scale).toBe(2);

    const quantity = await columnFacts("SettlementLine", "quantity");
    expect(quantity, "SettlementLine.quantity is missing").not.toBeNull();
    expect(quantity!.data_type).toBe("numeric");
    expect(quantity!.numeric_precision).toBe(12);
    expect(quantity!.numeric_scale).toBe(4);
  });

  it("EmployeePayment.amount is money, not a Float read as grams", async () => {
    // It was `Float` and polymorphic — read in whatever `unit` said, which on a
    // gold payout was grams, with `amountUsd` alongside to carry the money.
    // Settlements took that job, so this can be exactly one thing.
    const amount = await columnFacts("EmployeePayment", "amount");
    expect(amount, "EmployeePayment.amount is missing").not.toBeNull();
    expect(amount!.data_type).toBe("numeric");
    expect(amount!.numeric_scale).toBe(2);
  });
});
