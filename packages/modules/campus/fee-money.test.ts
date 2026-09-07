/**
 * S-2.1, S-2.2 and S-2.4 — migration witnesses.
 *
 * The invariants these assert are held by the database, not by the routes, so
 * every one of them inserts **past the service layer**. That is the whole
 * point: a check in a handler produces a good sentence, and a constraint is
 * what survives two bursars at two desks.
 *
 *   S-2.1  the money columns are Decimal(14,2): they refuse a magnitude a
 *          double swallowed, they round at the cent rather than storing
 *          binary approximations, and a sum over them is exact.
 *   S-2.2  currency, exchangeRate and baseAmount exist, a rate of zero is
 *          unrepresentable, and the base amount restates the total.
 *   S-2.4  one live invoice per student, per term, per fee structure — and a
 *          voided one does not block its replacement.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import {
  isDuplicateLiveInvoice,
  refreshFeeInvoiceBalance,
} from "./fees-posting";

let companyId: string;
let academicYearId: string;
let termId: string;
let classId: string;
let studentId: string;
let otherStudentId: string;
let feeStructureId: string;
let otherFeeStructureId: string;
let stamp: number;

async function makeInvoice(input: {
  studentId?: string;
  termId?: string;
  feeStructureId?: string | null;
  status?: "DRAFT" | "ISSUED" | "PART_PAID" | "PAID" | "VOIDED" | "WRITEOFF";
  invoiceNo?: string;
}) {
  return prisma.schoolFeeInvoice.create({
    data: {
      companyId,
      invoiceNo: input.invoiceNo ?? `INV-${stamp}-${Math.random().toString(36).slice(2, 10)}`,
      studentId: input.studentId ?? studentId,
      termId: input.termId ?? termId,
      feeStructureId: input.feeStructureId === undefined ? feeStructureId : input.feeStructureId,
      issueDate: new Date("2026-05-01T00:00:00.000Z"),
      dueDate: new Date("2026-05-31T00:00:00.000Z"),
      status: input.status ?? "ISSUED",
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Fee Money School ${stamp}`, slug: `fee-money-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `FM${stamp}`,
      name: "2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    },
    select: { id: true },
  });
  academicYearId = year.id;

  const term = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId,
      code: "T2",
      name: "Term 2",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-08-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  termId = term.id;

  const schoolClass = await prisma.schoolClass.create({
    data: { companyId, code: "F1", name: "Form 1", level: 1 },
    select: { id: true },
  });
  classId = schoolClass.id;

  const [child, sibling] = await Promise.all([
    prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `FM${stamp}A`,
        firstName: "Tadiwa",
        lastName: "Moyo",
        status: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `FM${stamp}B`,
        firstName: "Rutendo",
        lastName: "Moyo",
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  ]);
  studentId = child.id;
  otherStudentId = sibling.id;

  const [tuition, boarding] = await Promise.all([
    prisma.schoolFeeStructure.create({
      data: { companyId, termId, classId, name: "Tuition", currency: "USD" },
      select: { id: true },
    }),
    prisma.schoolFeeStructure.create({
      data: { companyId, termId, classId, name: "Boarding", currency: "USD" },
      select: { id: true },
    }),
  ]);
  feeStructureId = tuition.id;
  otherFeeStructureId = boarding.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.schoolFeeReceipt.deleteMany({ where: { companyId } });
  await prisma.schoolFeeWaiver.deleteMany({ where: { companyId } });
  await prisma.schoolFeeInvoice.deleteMany({ where: { companyId } });
});

describe("S-2.1 — the money columns are Decimal(14,2) — MIGRATION WITNESS", () => {
  it("refuses a magnitude a double accepted without complaint", async () => {
    const invoice = await makeInvoice({});
    // 10^13 is a perfectly ordinary double and was a perfectly ordinary
    // `totalAmount` yesterday. Decimal(14,2) has twelve digits before the
    // point, so it is now unrepresentable and says so.
    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeInvoice" SET "totalAmount" = 10000000000000
        WHERE "id" = ${invoice.id}
      `,
    ).rejects.toThrow(/overflow/i);
  });

  it("stores a fee line at the cent rather than a binary approximation", async () => {
    const invoice = await makeInvoice({});
    // The float-era helper rounded 8.575 down to 8.57, because 8.575 is not
    // representable in binary. The column rounds half away from zero.
    await prisma.$executeRaw`
      INSERT INTO "SchoolFeeInvoiceLine"
        ("id", "companyId", "invoiceId", "feeCode", "description",
         "quantity", "unitAmount", "taxRate", "taxAmount", "lineTotal", "updatedAt")
      VALUES
        (gen_random_uuid()::text, ${companyId}, ${invoice.id}, 'TUITION', 'Tuition',
         1, 8.575, 0, 0, 8.575, NOW())
    `;

    const line = await prisma.schoolFeeInvoiceLine.findFirstOrThrow({
      where: { invoiceId: invoice.id },
      select: { unitAmount: true, lineTotal: true },
    });
    expect(line.unitAmount.toFixed(2)).toBe("8.58");
    expect(line.lineTotal.toFixed(2)).toBe("8.58");
  });

  it("keeps a quantity at four places so a term can be billed a third at a time", async () => {
    const invoice = await makeInvoice({});
    await prisma.$executeRaw`
      INSERT INTO "SchoolFeeInvoiceLine"
        ("id", "companyId", "invoiceId", "feeCode", "description",
         "quantity", "unitAmount", "taxRate", "taxAmount", "lineTotal", "updatedAt")
      VALUES
        (gen_random_uuid()::text, ${companyId}, ${invoice.id}, 'TUITION', 'Third of a term',
         0.33333, 1500, 15, 0, 0, NOW())
    `;

    const line = await prisma.schoolFeeInvoiceLine.findFirstOrThrow({
      where: { invoiceId: invoice.id },
      select: { quantity: true, taxRate: true },
    });
    expect(line.quantity.toFixed(4)).toBe("0.3333");
    // A tax rate is a percentage at two places, not money.
    expect(line.taxRate.toFixed(2)).toBe("15.00");
  });

  it("refuses a tax rate that could not be a percentage", async () => {
    const invoice = await makeInvoice({});
    await expect(
      prisma.$executeRaw`
        INSERT INTO "SchoolFeeInvoiceLine"
          ("id", "companyId", "invoiceId", "feeCode", "description",
           "quantity", "unitAmount", "taxRate", "taxAmount", "lineTotal", "updatedAt")
        VALUES
          (gen_random_uuid()::text, ${companyId}, ${invoice.id}, 'TUITION', 'Tuition',
           1, 100, 100000, 0, 0, NOW())
      `,
    ).rejects.toThrow(/overflow/i);
  });

  it("totals a hundred lines exactly", async () => {
    const invoice = await makeInvoice({});
    await prisma.schoolFeeInvoiceLine.createMany({
      data: Array.from({ length: 100 }, (_, index) => ({
        companyId,
        invoiceId: invoice.id,
        feeCode: `LINE${index}`,
        description: `Line ${index}`,
        quantity: new Prisma.Decimal(1),
        unitAmount: new Prisma.Decimal("0.07"),
        taxRate: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal("0.07"),
      })),
    });

    const refreshed = await prisma.$transaction((tx) =>
      refreshFeeInvoiceBalance(tx, { companyId, invoiceId: invoice.id }),
    );

    expect(refreshed?.totalAmount.toFixed(2)).toBe("7.00");
    expect(refreshed?.balanceAmount.toFixed(2)).toBe("7.00");
    expect(refreshed?.subTotal.toFixed(2)).toBe("7.00");
  });
});

describe("S-2.2 — currency, rate and the base-currency equivalent", () => {
  it("defaults an existing school to USD at a rate of one", async () => {
    const invoice = await makeInvoice({});
    const row = await prisma.schoolFeeInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { currency: true, exchangeRate: true, baseAmount: true },
    });
    expect(row.currency).toBe("USD");
    expect(row.exchangeRate.toFixed(4)).toBe("1.0000");
    expect(row.baseAmount.toFixed(2)).toBe("0.00");
  });

  it("refuses a rate of zero, which would make the base amount undefined — MIGRATION WITNESS", async () => {
    const invoice = await makeInvoice({});
    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeInvoice" SET "exchangeRate" = 0 WHERE "id" = ${invoice.id}
      `,
    ).rejects.toThrow(/exchangeRate_check/i);
  });

  it("refuses a blank currency — MIGRATION WITNESS", async () => {
    const invoice = await makeInvoice({});
    await expect(
      prisma.$executeRaw`
        UPDATE "SchoolFeeInvoice" SET "currency" = '' WHERE "id" = ${invoice.id}
      `,
    ).rejects.toThrow(/currency_check/i);
  });

  it("restates a ZWG invoice in the school's base currency", async () => {
    const invoice = await makeInvoice({});
    await prisma.schoolFeeInvoice.update({
      where: { id: invoice.id },
      data: { currency: "ZWG", exchangeRate: new Prisma.Decimal("27.5") },
    });
    await prisma.schoolFeeInvoiceLine.create({
      data: {
        companyId,
        invoiceId: invoice.id,
        feeCode: "TUITION",
        description: "Tuition",
        quantity: new Prisma.Decimal(1),
        unitAmount: new Prisma.Decimal("27500"),
        taxRate: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal("27500"),
      },
    });

    const refreshed = await prisma.$transaction((tx) =>
      refreshFeeInvoiceBalance(tx, { companyId, invoiceId: invoice.id }),
    );

    // Billed 27,500 ZWG; 27.5 ZWG buys a dollar, so the ledger sees $1,000.
    expect(refreshed?.totalAmount.toFixed(2)).toBe("27500.00");
    expect(refreshed?.baseAmount.toFixed(2)).toBe("1000.00");
  });
});

describe("S-2.4 — one live invoice per student, term and fee structure — MIGRATION WITNESS", () => {
  it("refuses a second invoice for the same student, term and structure", async () => {
    await makeInvoice({});
    const duplicate = await makeInvoice({}).catch((error: unknown) => error);
    expect(duplicate).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((duplicate as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
    // Prisma reports the column list rather than the index name for an index
    // it does not know about, which is why the route detects it that way.
    expect(isDuplicateLiveInvoice(duplicate)).toBe(true);
  });

  it("does not mistake a duplicate invoice number for a duplicate bill", async () => {
    const invoiceNo = `INV-${stamp}-DUP`;
    await makeInvoice({ invoiceNo, feeStructureId: null });
    const clash = await makeInvoice({
      invoiceNo,
      studentId: otherStudentId,
      feeStructureId: null,
    }).catch((error: unknown) => error);
    expect((clash as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
    expect(isDuplicateLiveInvoice(clash)).toBe(false);
  });

  it("still allows the boarding bill alongside the tuition bill", async () => {
    await makeInvoice({ feeStructureId });
    await expect(
      makeInvoice({ feeStructureId: otherFeeStructureId }),
    ).resolves.toBeTruthy();
  });

  it("lets a voided invoice be replaced", async () => {
    const first = await makeInvoice({});
    await prisma.schoolFeeInvoice.update({
      where: { id: first.id },
      data: { status: "VOIDED" },
    });
    await expect(makeInvoice({})).resolves.toBeTruthy();
  });

  it("does not confuse two children", async () => {
    await makeInvoice({ studentId });
    await expect(makeInvoice({ studentId: otherStudentId })).resolves.toBeTruthy();
  });

  it("leaves ad-hoc invoices with no fee structure repeatable", async () => {
    // A school trip and a replacement blazer are two deliberate one-off bills
    // in one term, not a double-billing. `feeStructureId` is NULL for both and
    // Postgres treats NULLs as distinct, so the index does not see them.
    await makeInvoice({ feeStructureId: null });
    await expect(makeInvoice({ feeStructureId: null })).resolves.toBeTruthy();
  });
});
