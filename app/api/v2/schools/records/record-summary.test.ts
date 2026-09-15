/**
 * A glance at a campus record, and who is allowed one.
 *
 * The summary is a second door onto records that already have a detail
 * endpoint, and a second door is where access control goes missing: the shape
 * is new, the guard is not, and a route that forgot to copy it would hand a
 * pupil's guardian, phone number and fee standing to anybody signed in. So the
 * refusals are pinned as hard as the answers:
 *
 *   an unknown entity is refused before anything is read;
 *   another tenant's records are not there at all, whoever asks;
 *   a role without the grant is refused, in the same words the record page uses;
 *   and — the direction that is just as easy to get wrong — a teacher is
 *   answered about any pupil the roll already lets them open, because a glance
 *   that refused what the click allows would be a second door disagreeing with
 *   the first.
 *
 * And the one case that must NOT be a refusal: a pupil taken off the roll is
 * still reachable by every link ever made to her, so she comes back archived
 * rather than missing.
 *
 * Drives the real handler against a real Postgres with only the session mocked.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET: getSummary } = await import("./[entity]/[id]/summary/route");
const { GET: getStudentDetail } = await import("../students/[id]/route");

let companyId: string;
let otherCompanyId: string;
let adminUserId: string;
/** Takes Form 2's mathematics, so Form 2's pupils are hers to read. */
let ownTeacherUserId: string;
/** Teaches nothing this term. */
let strangerTeacherUserId: string;
let studentId: string;
let withdrawnStudentId: string;
let otherTenantStudentId: string;
let guardianId: string;
let teacherProfileId: string;
let classId: string;
let subjectId: string;
let hostelId: string;
let stamp: number;

const MISSING_ID = "11111111-1111-4111-8111-111111111111";

async function call(entity: string, id: string) {
  const response = await getSummary(
    new NextRequest(`http://school.test/api/v2/schools/records/${entity}/${id}/summary`),
    { params: Promise.resolve({ entity, id }) },
  );
  return { status: response.status, body: await response.json() };
}

/** The same record through the door the peek is a preview of. */
async function callStudentDetail(id: string) {
  const response = await getStudentDetail(
    new NextRequest(`http://school.test/api/v2/schools/students/${id}`),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status };
}

function signInAs(userId: string, role: string) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: userId, companyId, role } },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const [company, otherCompany] = await Promise.all([
    prisma.company.create({
      data: { name: `Peek School ${stamp}`, slug: `peek-school-${stamp}` },
      select: { id: true },
    }),
    prisma.company.create({
      data: { name: `Next Door ${stamp}`, slug: `next-door-${stamp}` },
      select: { id: true },
    }),
  ]);
  companyId = company.id;
  otherCompanyId = otherCompany.id;

  const [admin, ownTeacher, strangerTeacher] = await Promise.all([
    prisma.user.create({
      data: {
        companyId,
        email: `head-${stamp}@peek.test`,
        name: "Nyasha Chirwa",
        role: "SCHOOL_ADMIN",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        companyId,
        email: `teacher-${stamp}@peek.test`,
        name: "Farai Dube",
        role: "TEACHER",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        companyId,
        email: `stranger-${stamp}@peek.test`,
        name: "Tapiwa Ncube",
        role: "TEACHER",
      },
      select: { id: true },
    }),
  ]);
  adminUserId = admin.id;
  ownTeacherUserId = ownTeacher.id;
  strangerTeacherUserId = strangerTeacher.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: `PK${stamp}`,
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
      code: "T1",
      name: "Term 1",
      startDate: new Date("2026-01-10T00:00:00.000Z"),
      endDate: new Date("2026-04-10T00:00:00.000Z"),
      isActive: true,
    },
    select: { id: true },
  });

  const schoolClass = await prisma.schoolClass.create({
    data: {
      companyId,
      code: `F2-${stamp}`,
      name: "Form 2",
      level: 2,
      capacity: 30,
      termId: term.id,
    },
    select: { id: true },
  });
  classId = schoolClass.id;
  const stream = await prisma.schoolStream.create({
    data: { companyId, classId, code: "B", name: "Blue" },
    select: { id: true },
  });

  const subject = await prisma.schoolSubject.create({
    data: { companyId, code: `MAT-${stamp}`, name: "Mathematics", isCore: true, passMark: 50 },
    select: { id: true },
  });
  subjectId = subject.id;

  const [ownProfile] = await Promise.all([
    prisma.schoolTeacherProfile.create({
      data: {
        companyId,
        userId: ownTeacherUserId,
        employeeCode: `T1-${stamp}`,
        department: "Sciences",
        isClassTeacher: true,
      },
      select: { id: true },
    }),
    prisma.schoolTeacherProfile.create({
      data: { companyId, userId: strangerTeacherUserId, employeeCode: `T2-${stamp}` },
      select: { id: true },
    }),
  ]);
  teacherProfileId = ownProfile.id;

  await prisma.schoolClassSubject.create({
    data: {
      companyId,
      termId: term.id,
      classId,
      streamId: stream.id,
      subjectId,
      teacherProfileId,
    },
  });

  const hostel = await prisma.schoolHostel.create({
    data: {
      companyId,
      code: `H-${stamp}`,
      name: "Nyanga House",
      genderPolicy: "MALE",
      capacity: 40,
    },
    select: { id: true },
  });
  hostelId = hostel.id;
  const room = await prisma.schoolHostelRoom.create({
    data: { companyId, hostelId, code: "R1", capacity: 4 },
    select: { id: true },
  });
  const bed = await prisma.schoolHostelBed.create({
    data: { companyId, hostelId, roomId: room.id, code: "R1-1", status: "OCCUPIED" },
    select: { id: true },
  });

  const guardian = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: `G-${stamp}`,
      firstName: "Rudo",
      lastName: "Moyo",
      phone: "0772000111",
      email: "rudo@peek.test",
      address: "14 Samora Machel Ave, Harare",
    },
    select: { id: true },
  });
  guardianId = guardian.id;

  const [student, withdrawn, otherTenantStudent] = await Promise.all([
    prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S-${stamp}`,
        firstName: "Tendai",
        lastName: "Moyo",
        status: "ACTIVE",
        currentClassId: classId,
        currentStreamId: stream.id,
        isBoarding: true,
      },
      select: { id: true },
    }),
    prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `W-${stamp}`,
        firstName: "Anesu",
        lastName: "Moyo",
        status: "WITHDRAWN",
        currentClassId: classId,
      },
      select: { id: true },
    }),
    prisma.schoolStudent.create({
      data: {
        companyId: otherCompanyId,
        studentNo: `X-${stamp}`,
        firstName: "Chipo",
        lastName: "Banda",
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  ]);
  studentId = student.id;
  withdrawnStudentId = withdrawn.id;
  otherTenantStudentId = otherTenantStudent.id;

  await prisma.schoolStudentGuardian.create({
    data: { companyId, studentId, guardianId, relationship: "MOTHER", isPrimary: true },
  });

  await prisma.schoolBoardingAllocation.create({
    data: {
      companyId,
      studentId,
      termId: term.id,
      hostelId,
      roomId: room.id,
      bedId: bed.id,
      status: "ACTIVE",
      startDate: new Date("2026-01-10T00:00:00.000Z"),
    },
  });

  await prisma.schoolFeeInvoice.create({
    data: {
      companyId,
      invoiceNo: `PKI-${stamp}`,
      studentId,
      termId: term.id,
      issueDate: new Date("2026-01-12T00:00:00.000Z"),
      dueDate: new Date("2026-02-12T00:00:00.000Z"),
      status: "ISSUED",
      subTotal: "450.00",
      totalAmount: "450.00",
      balanceAmount: "450.00",
      currency: "USD",
    },
  });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.company.delete({ where: { id: otherCompanyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(() => {
  signInAs(adminUserId, "SCHOOL_ADMIN");
});

describe("what a glance at each record says", () => {
  it("describes a pupil by her form room, her family and what is owed", async () => {
    const { status, body } = await call("student", studentId);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      entity: "student",
      id: studentId,
      href: `/schools/students/${studentId}`,
      title: "Tendai Moyo",
      reference: `S-${stamp}`,
      subtitle: "Form 2 · Blue",
      archived: false,
    });
    // A child on the roll needs no badge saying so.
    expect(body.status).toBeNull();
    expect(body.properties).toEqual([
      { label: "Guardian", value: "Rudo Moyo" },
      { label: "Guardian's phone", value: "0772000111" },
      // Billed on 12 February and read after it, so the bill is late.
      { label: "Fees", value: "USD 450.00 — overdue" },
      { label: "House", value: "Nyanga House" },
    ]);
  });

  it("describes a guardian by the children the school would ring them about", async () => {
    const { status, body } = await call("guardian", guardianId);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      entity: "guardian",
      title: "Rudo Moyo",
      reference: `G-${stamp}`,
      subtitle: "0772000111 · 1 child",
      archived: false,
    });
    expect(body.properties).toContainEqual({ label: "Children", value: "Tendai Moyo" });
  });

  it("describes a teacher by what they teach and to whom", async () => {
    const { status, body } = await call("teacher", teacherProfileId);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      entity: "teacher",
      title: "Farai Dube",
      reference: `T1-${stamp}`,
      subtitle: "Sciences · Form teacher",
      archived: false,
    });
    expect(body.properties).toContainEqual({ label: "Teaches", value: "Mathematics" });
    expect(body.properties).toContainEqual({ label: "Classes", value: "Form 2" });
  });

  it("describes a class against its roll", async () => {
    const { status, body } = await call("class", classId);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      entity: "class",
      href: `/management/master-data/schools/classes/${classId}`,
      title: "Form 2",
      // Two pupils are registered here: one on the roll, one withdrawn.
      subtitle: "Term 1 · 2 of 30",
    });
    expect(body.properties).toContainEqual({ label: "Streams", value: "1" });
  });

  it("describes a subject by who takes it", async () => {
    const { status, body } = await call("subject", subjectId);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      entity: "subject",
      title: "Mathematics",
      subtitle: "Core · Pass at 50",
      archived: false,
    });
    expect(body.properties).toContainEqual({ label: "Taught to", value: "Form 2" });
    expect(body.properties).toContainEqual({ label: "Taught by", value: "Farai Dube" });
  });

  it("describes a house by whether there is room in it", async () => {
    const { status, body } = await call("hostel", hostelId);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      entity: "hostel",
      title: "Nyanga House",
      subtitle: "Boys · 1 of 1 beds",
      archived: false,
    });
    expect(body.properties).toContainEqual({ label: "Free beds", value: "0" });
  });
});

describe("a pupil who has left", () => {
  it("still answers, and says she has been taken off the roll", async () => {
    const { status, body } = await call("student", withdrawnStudentId);

    // Not a 404: every link ever made to her still points here, and "deleted"
    // is the wrong thing to tell whoever followed one.
    expect(status).toBe(200);
    expect(body.archived).toBe(true);
    expect(body.title).toBe("Anesu Moyo");
  });
});

describe("what the route refuses", () => {
  it("refuses a record type it does not describe", async () => {
    // A CRM type is a record, and is summarised by the CRM route; this one does
    // not know how to read a deal and must not guess.
    const { status, body } = await call("deal", studentId);
    expect(status).toBe(400);
    expect(body.error).toMatch(/unknown record type/i);
  });

  it("refuses a record type that does not exist at all", async () => {
    const { status } = await call("aardvark", studentId);
    expect(status).toBe(400);
  });

  it("gives another tenant's pupil to nobody", async () => {
    const stranger = await call("student", otherTenantStudentId);
    const missing = await call("student", MISSING_ID);

    // Identical, so walking ids teaches nothing about who is enrolled next door.
    expect(stranger.status).toBe(404);
    expect(stranger.status).toBe(missing.status);
    expect(stranger.body.error).toBe(missing.body.error);
  });

  it("refuses a role the record page would refuse, in the same words", async () => {
    // A bursar holds no boarding grant, so the house is not theirs to look at
    // from either door.
    signInAs(adminUserId, "BURSAR");

    const { status, body } = await call("hostel", hostelId);
    expect(status).toBe(403);
    expect(body.error).toMatch(/boarding/i);
  });
});

describe("the glance is exactly as open as the page", () => {
  it("shows a pupil in a class the teacher takes", async () => {
    signInAs(ownTeacherUserId, "TEACHER");

    const { status, body } = await call("student", studentId);
    expect(status).toBe(200);
    expect(body.title).toBe("Tendai Moyo");
  });

  it("shows a pupil in a class the teacher does not take, because the roll does", async () => {
    // It is tempting to narrow this to the classes somebody actually teaches,
    // the way the marks and homework routes are narrowed. Those routes are the
    // only door to a class's work; this one previews a page every teacher can
    // already open, so narrowing it here would refuse on hover what the very
    // next click grants. Whether the roll should be narrower is a question for
    // the roll.
    signInAs(strangerTeacherUserId, "TEACHER");

    const { status } = await call("student", studentId);
    expect(status).toBe(200);
  });

  it("answers whatever the pupil's own endpoint answers, for the same caller", async () => {
    // Parity asserted rather than described, so that narrowing either door on
    // its own fails here rather than in somebody's hands.
    signInAs(strangerTeacherUserId, "TEACHER");

    const peek = await call("student", studentId);
    const page = await callStudentDetail(studentId);
    expect(peek.status).toBe(page.status);
  });

  it("does not narrow the office, which teaches nothing", async () => {
    signInAs(adminUserId, "REGISTRAR");

    const { status } = await call("student", studentId);
    expect(status).toBe(200);
  });
});
