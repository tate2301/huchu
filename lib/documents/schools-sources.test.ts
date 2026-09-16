/**
 * Iteration 5 — the school's printable documents.
 *
 * What is asserted here is what a wrong document costs, not that the resolvers
 * return objects:
 *
 *   **The report card is gated on publishing, and on nothing else.** A printable
 *   card carrying moderated-but-unpublished marks would be the hole in the wall
 *   beside the locked door, so this proves a submitted sheet releases nothing.
 *   It also proves the opposite failure, which is the one that actually shipped:
 *   the card additionally required an open `SchoolPublishWindow`, which no
 *   school has, so it threw for everybody. One test prints a card with no window
 *   anywhere in sight.
 *
 *   **A card carries position, attendance and conduct.** Marks alone are a mark
 *   sheet. What a Zimbabwean parent opens the envelope for is where the child
 *   came, how the class did on the same paper, how many days they were in, and
 *   how they behaved.
 *
 *   **Money is exact.** Amounts are `Decimal` all the way to the string, so a
 *   450.00 cannot print as 449.99999999999994.
 *
 *   **A bill is addressed to the family.** A seven-year-old is not the debtor.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

import { resolveSchoolDocument, SCHOOL_DOCUMENT_ACCESS } from "./schools-sources";

let companyId: string;
let termId: string;
let classId: string;
let studentId: string;
let invoiceId: string;
let receiptId: string;
let stamp: number;

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Docs School ${stamp}`, slug: `docs-school-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `DS${stamp}`,
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
    },
    select: { id: true },
  });
  termId = term.id;

  const schoolClass = await prisma.schoolClass.create({
    data: { companyId, code: "F2", name: "Form 2", level: 2, termId },
    select: { id: true },
  });
  classId = schoolClass.id;

  const guardian = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: `G${stamp}`,
      firstName: "Rudo",
      lastName: "Moyo",
      phone: "0772000111",
      address: "14 Chiremba Rd, Harare",
    },
    select: { id: true },
  });

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `S${stamp}`,
      firstName: "Tendai",
      lastName: "Moyo",
      status: "ACTIVE",
      currentClassId: classId,
      guardianLinks: {
        create: { companyId, guardianId: guardian.id, relationship: "MOTHER", isPrimary: true },
      },
    },
    select: { id: true },
  });
  studentId = student.id;

  const invoice = await prisma.schoolFeeInvoice.create({
    data: {
      companyId,
      invoiceNo: `SFI-${stamp}`,
      studentId,
      termId,
      issueDate: new Date("2026-05-08T00:00:00.000Z"),
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      status: "PART_PAID",
      subTotal: "450.00",
      totalAmount: "450.00",
      paidAmount: "180.00",
      balanceAmount: "270.00",
      currency: "USD",
      lines: {
        create: [
          {
            companyId,
            feeCode: "TUITION",
            description: "Tuition",
            quantity: "1",
            unitAmount: "400.00",
            lineTotal: "400.00",
          },
          {
            companyId,
            feeCode: "DEV",
            description: "Development levy",
            quantity: "1",
            unitAmount: "50.00",
            lineTotal: "50.00",
          },
        ],
      },
    },
    select: { id: true },
  });
  invoiceId = invoice.id;

  const receipt = await prisma.schoolFeeReceipt.create({
    data: {
      companyId,
      receiptNo: `SFR-${stamp}`,
      studentId,
      receiptDate: new Date("2026-05-20T00:00:00.000Z"),
      paymentMethod: "MOBILE_MONEY",
      reference: "EC-77120",
      amountReceived: "180.00",
      amountAllocated: "180.00",
      amountUnallocated: "0.00",
      currency: "USD",
      status: "POSTED",
      allocations: {
        create: { companyId, invoiceId, allocatedAmount: "180.00" },
      },
    },
    select: { id: true },
  });
  receiptId = receipt.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("a fee invoice", () => {
  it("is addressed to the family, not to the child", async () => {
    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.fee.invoice",
      recordId: invoiceId,
    });

    expect(document.payload.parties?.[0].title).toBe("Bill to");
    expect(document.payload.parties?.[0].lines[0]).toBe("Rudo Moyo");
    expect(document.payload.parties?.[0].lines[1]).toContain("mother of Tendai Moyo");
  });

  it("prints its own lines and its balance, to the penny", async () => {
    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.fee.invoice",
      recordId: invoiceId,
    });

    expect(document.payload.record?.lines).toEqual([
      {
        feeCode: "DEV",
        description: "Development levy",
        quantity: "1.00",
        unitAmount: "50.00",
        amount: "50.00",
      },
      {
        feeCode: "TUITION",
        description: "Tuition",
        quantity: "1.00",
        unitAmount: "400.00",
        amount: "400.00",
      },
    ]);
    expect(document.payload.totals).toEqual(
      expect.arrayContaining([
        { label: "Balance due", value: "USD 270.00", emphasis: true },
      ]),
    );
  });

  it("refuses a bill from another tenant", async () => {
    const other = await prisma.company.create({
      data: { name: `Other ${stamp}`, slug: `other-${stamp}` },
      select: { id: true },
    });
    await expect(
      resolveSchoolDocument(other.id, {
        sourceKey: "schools.fee.invoice",
        recordId: invoiceId,
      }),
    ).rejects.toThrow(/not found/i);
    await prisma.company.delete({ where: { id: other.id } });
  });
});

describe("a fee receipt", () => {
  it("says what the money was put against", async () => {
    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.fee.receipt",
      recordId: receiptId,
    });

    expect(document.payload.record?.lines).toHaveLength(1);
    expect(document.payload.record?.lines?.[0]).toMatchObject({
      term: "Term 2",
      amount: "180.00",
    });
    expect(document.payload.totals?.[0]).toEqual({
      label: "Amount received",
      value: "USD 180.00",
      emphasis: true,
    });
  });
});

describe("a fee statement", () => {
  it("is a sequence of charges and payments with the balance left", async () => {
    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.fee.statement",
      recordId: studentId,
    });

    const lines = document.payload.record?.lines ?? [];
    expect(lines).toHaveLength(2);
    // In date order: billed on the 8th, paid on the 20th.
    expect(lines[0]).toMatchObject({ date: "2026-05-08", charge: "450.00" });
    expect(lines[1]).toMatchObject({ date: "2026-05-20", payment: "180.00" });
    expect(document.payload.totals?.[0].value).toBe("USD 270.00");
  });
});

describe("a report card", () => {
  it("refuses when the pupil has no published marks for the term", async () => {
    await expect(
      resolveSchoolDocument(companyId, {
        sourceKey: "schools.report-card",
        recordId: studentId,
        filters: { termId },
      }),
    ).rejects.toThrow(/No published marks/i);
  });

  it("releases nothing from a sheet still with the head of department", async () => {
    const sheet = await prisma.schoolResultSheet.create({
      data: {
        companyId,
        termId,
        classId,
        title: "Term 2 results",
        status: "SUBMITTED",
        lines: {
          create: { companyId, studentId, subjectCode: "MAT", score: 72, grade: "B" },
        },
      },
      select: { id: true },
    });

    // Publishing is the act that releases marks. A submitted sheet is a
    // teacher's work awaiting moderation and a card must not carry it.
    await expect(
      resolveSchoolDocument(companyId, {
        sourceKey: "schools.report-card",
        recordId: studentId,
        filters: { termId },
      }),
    ).rejects.toThrow(/No published marks/i);

    await prisma.schoolResultSheet.delete({ where: { id: sheet.id } });
  });

  it("prints without a publish window, because no school configures one", async () => {
    // The regression this pins. The card used to require an OPEN
    // SchoolPublishWindow as well, and nothing in provisioning or the seed
    // writes one — so the most important document in the module threw at every
    // school whose marks were published and whose families could already read
    // them in the portal. No window is created anywhere in this test.
    const sheet = await prisma.schoolResultSheet.create({
      data: {
        companyId,
        termId,
        classId,
        title: "Term 2 results",
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-02T00:00:00.000Z"),
        lines: {
          create: { companyId, studentId, subjectCode: "MAT", score: 72, grade: "B" },
        },
      },
      select: { id: true },
    });

    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.report-card",
      recordId: studentId,
      filters: { termId },
    });
    expect(document.payload.record?.lines ?? []).toHaveLength(1);

    await prisma.schoolResultSheet.delete({ where: { id: sheet.id } });
  });

  it("prints the published marks with each subject's own pass mark", async () => {
    await prisma.schoolSubject.createMany({
      data: [
        { companyId, code: "MAT", name: "Mathematics", passMark: 50 },
        { companyId, code: "SHO", name: "Shona", passMark: 40 },
      ],
      skipDuplicates: true,
    });

    const sheet = await prisma.schoolResultSheet.create({
      data: {
        companyId,
        termId,
        classId,
        title: "Term 2 results",
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-02T00:00:00.000Z"),
        lines: {
          create: [
            { companyId, studentId, subjectCode: "MAT", score: 45, grade: "D" },
            { companyId, studentId, subjectCode: "SHO", score: 45, grade: "C" },
          ],
        },
      },
      select: { id: true },
    });

    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.report-card",
      recordId: studentId,
      filters: { termId },
    });

    const rows = document.payload.record?.lines ?? [];
    // The same 45 is a fail in Mathematics and a pass in Shona, because the pass
    // mark belongs to the subject (S-1.3). A card that used one school-wide
    // number would be saying something the school did not.
    expect(rows).toEqual([
      expect.objectContaining({ subject: "Mathematics", score: "45.0", outcome: "Below pass" }),
      expect.objectContaining({ subject: "Shona", score: "45.0", outcome: "Pass" }),
    ]);

    // The four facts a Zimbabwean card carries beyond the marks. This pupil is
    // the only one in the group with published marks, so the position is first
    // of one and each subject's class average is their own mark.
    const meta = document.payload.meta ?? [];
    expect(meta).toEqual(
      expect.arrayContaining([
        { label: "Admission number", value: expect.any(String) },
        { label: "Position in class", value: "1st of 1" },
        { label: "Attendance", value: expect.any(String) },
        { label: "Conduct", value: expect.any(String) },
      ]),
    );
    expect(rows[0]).toEqual(expect.objectContaining({ classAverage: "45.0" }));

    await prisma.schoolResultSheet.delete({ where: { id: sheet.id } });
  });

  it("positions a pupil against the rest of the teaching group", async () => {
    const peer = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: "POS-PEER-1",
        firstName: "Rudo",
        lastName: "Moyo",
        currentClassId: classId,
      },
      select: { id: true },
    });

    const sheet = await prisma.schoolResultSheet.create({
      data: {
        companyId,
        termId,
        classId,
        title: "Term 2 positions",
        status: "PUBLISHED",
        publishedAt: new Date("2026-08-02T00:00:00.000Z"),
        lines: {
          create: [
            { companyId, studentId, subjectCode: "MAT", score: 40, grade: "E" },
            { companyId, studentId: peer.id, subjectCode: "MAT", score: 80, grade: "A" },
          ],
        },
      },
      select: { id: true },
    });

    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.report-card",
      recordId: studentId,
      filters: { termId },
    });

    // 40 against a peer's 80: second of two, and the class average is the 60
    // that makes the 40 readable.
    expect(document.payload.meta).toEqual(
      expect.arrayContaining([{ label: "Position in class", value: "2nd of 2" }]),
    );
    expect(document.payload.record?.lines?.[0]).toEqual(
      expect.objectContaining({ classAverage: "60.0" }),
    );

    await prisma.schoolResultSheet.delete({ where: { id: sheet.id } });
    await prisma.schoolStudent.delete({ where: { id: peer.id } });
  });
});

describe("a class list", () => {
  it("carries the guardian and their phone number", async () => {
    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.class-list",
      filters: { classId },
    });

    expect(document.payload.list?.rows[0]).toMatchObject({
      name: "Moyo, Tendai",
      guardian: "Rudo Moyo",
      phone: "0772000111",
    });
    // The same rows go to CSV, so an export and a print cannot disagree.
    expect(document.rowsForCsv).toEqual(document.payload.list?.rows);
  });

  it("refuses without a class, rather than listing the school", async () => {
    await expect(
      resolveSchoolDocument(companyId, { sourceKey: "schools.class-list" }),
    ).rejects.toThrow(/classId is required/i);
  });
});

describe("a transfer letter", () => {
  it("states the outstanding balance rather than hiding it", async () => {
    const document = await resolveSchoolDocument(companyId, {
      sourceKey: "schools.transfer-letter",
      recordId: studentId,
    });

    expect(document.payload.totals?.[0]).toEqual({
      label: "Fees outstanding",
      value: "USD 270.00",
      emphasis: true,
    });
    expect(document.payload.notes?.[1]).toContain("outstanding fee balance");
  });
});

describe("who may render one", () => {
  it("names a feature and a role resource for every document", () => {
    // A new document added without an entry here is a document anybody signed in
    // on a schools tenant could render.
    for (const [key, access] of Object.entries(SCHOOL_DOCUMENT_ACCESS)) {
      expect(access.feature, key).toMatch(/^schools\./);
      expect(access.resource, key).toMatch(/^schools\./);
    }
  });
});
