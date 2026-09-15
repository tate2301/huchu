/**
 * Who may print a pupil's paper.
 *
 * The parent portal's four downloads — the bill, the receipt, the statement and
 * the report card — are the only school documents a portal account may ask for,
 * and a portal account holds no back-office grant to ask with. What decides it
 * is the guardian link, so this is the test that one family cannot print
 * another's.
 *
 * The refusals are checked as a set rather than one at a time: a stranger's
 * receipt, a receipt that was never issued and a child whose link withholds the
 * money all have to answer identically, or the id becomes an oracle for which
 * bills exist.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { prisma } from "@/lib/prisma";
import { canRenderPortalSchoolDocument } from "./_portal-scope";

let companyId: string;
let parentUserId: string;
let strangerParentUserId: string;
let pupilUserId: string;
let ownChildId: string;
let strangerChildId: string;
let ownInvoiceId: string;
let ownReceiptId: string;
let strangerInvoiceId: string;
let termId: string;

const MISSING_ID = "11111111-1111-4111-8111-111111111111";

function asParent(overrides: Partial<Parameters<typeof canRenderPortalSchoolDocument>[0]> = {}) {
  return canRenderPortalSchoolDocument({
    companyId,
    userId: parentUserId,
    role: "PARENT",
    sourceKey: "schools.fee.invoice",
    recordId: ownInvoiceId,
    ...overrides,
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Portal Documents ${stamp}`, slug: `portal-documents-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const [parentUser, strangerUser, pupilUser] = await Promise.all([
    prisma.user.create({
      data: {
        companyId,
        email: `pd-parent-${stamp}@portal.test`,
        name: "Rudo Moyo",
        role: "PARENT",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        companyId,
        email: `pd-stranger-${stamp}@portal.test`,
        name: "Grace Banda",
        role: "PARENT",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        companyId,
        email: `pd-pupil-${stamp}@portal.test`,
        name: "Tendai Moyo",
        role: "STUDENT",
      },
      select: { id: true },
    }),
  ]);
  parentUserId = parentUser.id;
  strangerParentUserId = strangerUser.id;
  pupilUserId = pupilUser.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `PD${stamp}`,
      name: "2026",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const term = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T2",
      name: "Term 2",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-08-01T00:00:00.000Z"),
      isActive: true,
    },
    select: { id: true },
  });
  termId = term.id;

  const schoolClass = await prisma.schoolClass.create({
    data: { companyId, code: "F2", name: "Form 2", level: 2 },
    select: { id: true },
  });

  const [ownChild, strangerChild] = await Promise.all([
    prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S${stamp}`,
        firstName: "Tendai",
        lastName: "Moyo",
        status: "ACTIVE",
        currentClassId: schoolClass.id,
        userId: pupilUserId,
      },
      select: { id: true },
    }),
    prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `T${stamp}`,
        firstName: "Anesu",
        lastName: "Banda",
        status: "ACTIVE",
        currentClassId: schoolClass.id,
      },
      select: { id: true },
    }),
  ]);
  ownChildId = ownChild.id;
  strangerChildId = strangerChild.id;

  const [guardian, strangerGuardian] = await Promise.all([
    prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo: `G${stamp}`,
        firstName: "Rudo",
        lastName: "Moyo",
        phone: "0772000111",
        userId: parentUserId,
      },
      select: { id: true },
    }),
    prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo: `H${stamp}`,
        firstName: "Grace",
        lastName: "Banda",
        phone: "0772000112",
        userId: strangerParentUserId,
      },
      select: { id: true },
    }),
  ]);

  await prisma.schoolStudentGuardian.createMany({
    data: [
      {
        companyId,
        studentId: ownChildId,
        guardianId: guardian.id,
        relationship: "MOTHER",
        isPrimary: true,
        canReceiveFinancials: true,
        canReceiveAcademicResults: true,
      },
      {
        companyId,
        studentId: strangerChildId,
        guardianId: strangerGuardian.id,
        relationship: "MOTHER",
        isPrimary: true,
        canReceiveFinancials: true,
        canReceiveAcademicResults: true,
      },
    ],
  });

  const [ownInvoice, strangerInvoice, receipt] = await Promise.all([
    prisma.schoolFeeInvoice.create({
      data: {
        companyId,
        invoiceNo: `PD-A-${stamp}`,
        studentId: ownChildId,
        termId,
        issueDate: new Date("2026-05-08T00:00:00.000Z"),
        dueDate: new Date("2026-06-05T00:00:00.000Z"),
        status: "ISSUED",
        subTotal: "450.00",
        totalAmount: "450.00",
        balanceAmount: "450.00",
        currency: "USD",
      },
      select: { id: true },
    }),
    prisma.schoolFeeInvoice.create({
      data: {
        companyId,
        invoiceNo: `PD-B-${stamp}`,
        studentId: strangerChildId,
        termId,
        issueDate: new Date("2026-05-08T00:00:00.000Z"),
        dueDate: new Date("2026-06-05T00:00:00.000Z"),
        status: "ISSUED",
        subTotal: "450.00",
        totalAmount: "450.00",
        balanceAmount: "450.00",
        currency: "USD",
      },
      select: { id: true },
    }),
    prisma.schoolFeeReceipt.create({
      data: {
        companyId,
        receiptNo: `PDR-${stamp}`,
        studentId: ownChildId,
        receiptDate: new Date("2026-05-20T00:00:00.000Z"),
        paymentMethod: "MOBILE_MONEY",
        amountReceived: "100.00",
        amountUnallocated: "100.00",
        currency: "USD",
        status: "POSTED",
      },
      select: { id: true },
    }),
  ]);
  ownInvoiceId = ownInvoice.id;
  strangerInvoiceId = strangerInvoice.id;
  ownReceiptId = receipt.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.schoolStudentGuardian.updateMany({
    where: { companyId, studentId: ownChildId },
    data: { canReceiveFinancials: true, canReceiveAcademicResults: true },
  });
});

describe("a guardian printing their own child's paper", () => {
  it("allows the bill, the receipt, the statement and the report card", async () => {
    const decisions = await Promise.all([
      asParent({ sourceKey: "schools.fee.invoice", recordId: ownInvoiceId }),
      asParent({ sourceKey: "schools.fee.receipt", recordId: ownReceiptId }),
      asParent({ sourceKey: "schools.fee.statement", recordId: ownChildId }),
      asParent({ sourceKey: "schools.report-card", recordId: ownChildId }),
    ]);

    expect(decisions.every((decision) => decision.allowed)).toBe(true);
  });

  it("refuses the office's own paper, which no portal hands out", async () => {
    const decisions = await Promise.all([
      asParent({ sourceKey: "schools.class-list", recordId: ownChildId }),
      asParent({ sourceKey: "schools.transfer-letter", recordId: ownChildId }),
      asParent({ sourceKey: "schools.admission-letter", recordId: ownChildId }),
    ]);

    expect(decisions.some((decision) => decision.allowed)).toBe(false);
  });
});

describe("a guardian printing somebody else's", () => {
  it("refuses another family's bill", async () => {
    const decision = await asParent({ recordId: strangerInvoiceId });
    expect(decision.allowed).toBe(false);
  });

  it("refuses an unlinked guardian the same way as a stranger", async () => {
    const unlinked = await canRenderPortalSchoolDocument({
      companyId,
      userId: strangerParentUserId,
      role: "PARENT",
      sourceKey: "schools.fee.invoice",
      recordId: ownInvoiceId,
    });
    const stranger = await asParent({ recordId: strangerInvoiceId });
    const missing = await asParent({ recordId: MISSING_ID });

    // Identical, so a parent walking ids cannot tell a bill that exists from one
    // that does not, nor learn whose it is.
    expect(unlinked).toEqual(stranger);
    expect(missing).toEqual(stranger);
    expect(stranger.allowed).toBe(false);
  });

  it("refuses a statement for a child who is not theirs", async () => {
    const decision = await asParent({
      sourceKey: "schools.fee.statement",
      recordId: strangerChildId,
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("what the school has agreed this parent may see", () => {
  it("withholds the bill when the link withholds the money", async () => {
    await prisma.schoolStudentGuardian.updateMany({
      where: { companyId, studentId: ownChildId },
      data: { canReceiveFinancials: false },
    });

    const decision = await asParent({ recordId: ownInvoiceId });
    const stranger = await asParent({ recordId: strangerInvoiceId });
    expect(decision).toEqual(stranger);
  });

  it("withholds the report card when the link withholds results", async () => {
    await prisma.schoolStudentGuardian.updateMany({
      where: { companyId, studentId: ownChildId },
      data: { canReceiveAcademicResults: false },
    });

    const decision = await asParent({
      sourceKey: "schools.report-card",
      recordId: ownChildId,
    });
    expect(decision.allowed).toBe(false);
  });

  it("still allows the bill when only results are withheld", async () => {
    await prisma.schoolStudentGuardian.updateMany({
      where: { companyId, studentId: ownChildId },
      data: { canReceiveAcademicResults: false },
    });

    const decision = await asParent({ recordId: ownInvoiceId });
    expect(decision.allowed).toBe(true);
  });
});

describe("a pupil printing their own", () => {
  it("allows their own report card", async () => {
    const decision = await canRenderPortalSchoolDocument({
      companyId,
      userId: pupilUserId,
      role: "STUDENT",
      sourceKey: "schools.report-card",
      recordId: ownChildId,
    });
    expect(decision.allowed).toBe(true);
  });

  it("refuses another pupil's", async () => {
    const decision = await canRenderPortalSchoolDocument({
      companyId,
      userId: pupilUserId,
      role: "STUDENT",
      sourceKey: "schools.report-card",
      recordId: strangerChildId,
    });
    expect(decision.allowed).toBe(false);
  });

  it("refuses an account linked to no pupil at all", async () => {
    const decision = await canRenderPortalSchoolDocument({
      companyId,
      userId: strangerParentUserId,
      role: "STUDENT",
      sourceKey: "schools.report-card",
      recordId: ownChildId,
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("the office", () => {
  it("is not admitted through the portal branch", async () => {
    // A bursar prints through the role grant the render route checks first; this
    // path is only for accounts that hold none.
    const decision = await canRenderPortalSchoolDocument({
      companyId,
      userId: parentUserId,
      role: "BURSAR",
      sourceKey: "schools.fee.invoice",
      recordId: ownInvoiceId,
    });
    expect(decision.allowed).toBe(false);
  });
});
