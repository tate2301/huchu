/**
 * S-6.2 — a parent may read their own children, and only what the school has told
 * them they may read.
 *
 * This is the test that matters most in the parent portal. Everything else is a
 * layout; this is whether one family can read another's. Four refusals are pinned:
 *
 *   a child id that is not theirs → 403, with the same message as a child that
 *   does not exist, so probing ids teaches nothing;
 *   `canReceiveFinancials` off → no fees, even though the account is linked;
 *   `canReceiveAcademicResults` off → no marks;
 *   an unpublished sheet → no marks, for anybody.
 *
 * Drives the real handlers against a real Postgres with only the session mocked.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@corelithzw/db/client";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@corelithzw/platform/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@corelithzw/platform/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET: getFees } = await import("./child/fees/route");
const { GET: getMarks } = await import("./child/marks/route");
const { GET: getAttendance } = await import("./child/attendance/route");

let companyId: string;
let parentUserId: string;
let otherParentUserId: string;
let ownChildId: string;
let strangerChildId: string;
let termId: string;
let stamp: number;

function get(path: string, query: Record<string, string>) {
  const params = new URLSearchParams(query).toString();
  return new NextRequest(`http://school.test${path}?${params}`);
}

async function call(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  query: Record<string, string>,
) {
  const response = await handler(get(path, query));
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Parent Portal ${stamp}`, slug: `parent-portal-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const [parentUser, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        companyId,
        email: `parent-${stamp}@portal.test`,
        name: "Rudo Moyo",
        role: "PARENT",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        companyId,
        email: `other-${stamp}@portal.test`,
        name: "Grace Banda",
        role: "PARENT",
      },
      select: { id: true },
    }),
  ]);
  parentUserId = parentUser.id;
  otherParentUserId = otherUser.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `PP${stamp}`,
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

  const [guardian, otherGuardian] = await Promise.all([
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
        userId: otherParentUserId,
      },
      select: { id: true },
    }),
  ]);

  const [own, stranger] = await Promise.all([
    prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S${stamp}`,
        firstName: "Tendai",
        lastName: "Moyo",
        status: "ACTIVE",
        currentClassId: schoolClass.id,
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
  ownChildId = own.id;
  strangerChildId = stranger.id;

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
        guardianId: otherGuardian.id,
        relationship: "MOTHER",
        isPrimary: true,
      },
    ],
  });

  await prisma.schoolFeeInvoice.create({
    data: {
      companyId,
      invoiceNo: `SFI-${stamp}`,
      studentId: ownChildId,
      termId,
      issueDate: new Date("2026-05-08T00:00:00.000Z"),
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      status: "ISSUED",
      subTotal: "450.00",
      totalAmount: "450.00",
      balanceAmount: "450.00",
      currency: "USD",
      lines: {
        create: {
          companyId,
          feeCode: "TUITION",
          description: "Tuition",
          quantity: "1",
          unitAmount: "450.00",
          lineTotal: "450.00",
        },
      },
    },
  });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: parentUserId, companyId, role: "PARENT" } },
  });
  await prisma.schoolStudentGuardian.updateMany({
    where: { companyId, studentId: ownChildId },
    data: { canReceiveFinancials: true, canReceiveAcademicResults: true },
  });
});

describe("whose child", () => {
  it("shows a parent their own child's bills, broken into lines", async () => {
    const { status, body } = await call(getFees, "/child/fees", { childId: ownChildId });

    expect(status).toBe(200);
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0].lines[0]).toMatchObject({
      description: "Tuition",
      amount: "450.00",
    });
    // A string, not a number: the balance crosses the wire exactly as the ledger
    // holds it.
    expect(body.invoices[0].balance).toBe("450.00");
  });

  it("refuses another family's child", async () => {
    const { status } = await call(getFees, "/child/fees", { childId: strangerChildId });
    expect(status).toBe(403);
  });

  it("answers the same way for a child that does not exist", async () => {
    const missing = await call(getFees, "/child/fees", {
      childId: "11111111-1111-4111-8111-111111111111",
    });
    const stranger = await call(getFees, "/child/fees", { childId: strangerChildId });
    // Identical, so a parent walking ids learns nothing about who is enrolled.
    expect(missing.status).toBe(stranger.status);
    expect(missing.body.error).toBe(stranger.body.error);
  });

  it("refuses without a child at all rather than guessing one", async () => {
    const { status } = await call(getFees, "/child/fees", {});
    expect(status).toBe(400);
  });
});

describe("what the school has agreed this parent may see", () => {
  it("withholds fees when the link says so", async () => {
    await prisma.schoolStudentGuardian.updateMany({
      where: { companyId, studentId: ownChildId },
      data: { canReceiveFinancials: false },
    });

    const { status, body } = await call(getFees, "/child/fees", { childId: ownChildId });
    expect(status).toBe(403);
    expect(body.error).toMatch(/financial/i);
  });

  it("withholds marks when the link says so", async () => {
    await prisma.schoolStudentGuardian.updateMany({
      where: { companyId, studentId: ownChildId },
      data: { canReceiveAcademicResults: false },
    });

    const { status, body } = await call(getMarks, "/child/marks", { childId: ownChildId });
    expect(status).toBe(403);
    expect(body.error).toMatch(/academic/i);
  });

  it("still shows attendance, which the flags do not cover", async () => {
    await prisma.schoolStudentGuardian.updateMany({
      where: { companyId, studentId: ownChildId },
      data: { canReceiveFinancials: false, canReceiveAcademicResults: false },
    });

    // A school that will not tell a parent whether their child came to school is
    // not a case these flags describe.
    const { status } = await call(getAttendance, "/child/attendance", {
      childId: ownChildId,
    });
    expect(status).toBe(200);
  });
});

describe("marks a school has not released", () => {
  it("are not shown, even to a parent with academic access", async () => {
    const sheet = await prisma.schoolResultSheet.create({
      data: {
        companyId,
        termId,
        classId: (
          await prisma.schoolClass.findFirstOrThrow({
            where: { companyId },
            select: { id: true },
          })
        ).id,
        title: "Term 2 — not yet checked",
        status: "SUBMITTED",
        lines: {
          create: { companyId, studentId: ownChildId, subjectCode: "MAT", score: 72 },
        },
      },
      select: { id: true },
    });

    const { status, body } = await call(getMarks, "/child/marks", { childId: ownChildId });
    expect(status).toBe(200);
    // A mark seen and then corrected is a conversation with a child about a grade
    // that never was.
    expect(body.marks).toEqual([]);

    await prisma.schoolResultSheet.update({
      where: { id: sheet.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });

    const after = await call(getMarks, "/child/marks", { childId: ownChildId });
    expect(after.body.marks).toHaveLength(1);
    expect(after.body.marks[0]).toMatchObject({ subjectCode: "MAT", score: 72 });

    await prisma.schoolResultSheet.delete({ where: { id: sheet.id } });
  });
});
