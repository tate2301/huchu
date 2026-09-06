/**
 * Portal identity — the isolation tests.
 *
 * These exist because identity used to be a string match: the student portal
 * compared the local part of the session email against `studentNo`, the parent
 * portal compared the session email against a nullable, non-unique
 * `SchoolGuardian.email`, and both fell through to an unfiltered query when the
 * session carried no email. Every assertion below fails if any of that comes
 * back.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  canViewAnyPortalSubject,
  consentDeniedMessage,
  getGuardianChildLink,
  guardianMaySee,
  resolvePortalGuardian,
  resolvePortalStudent,
  studentIdsWithConsent,
} from "./portal-identity";

let companyId: string;
let otherCompanyId: string;

/** Moyo: student STU0001, guardian, both with claimed accounts. */
let moyoStudentId: string;
let moyoStudentUserId: string;
let moyoGuardianId: string;
let moyoGuardianUserId: string;

/** Ncube: the other family, whose records nobody else may reach. */
let ncubeStudentId: string;
let ncubeGuardianId: string;

/** A user with no student or guardian record linked to it. */
let unlinkedUserId: string;
/** A staff user. */
let registrarUserId: string;

const STUDENT_SELECT = { id: true, studentNo: true } as const;
const GUARDIAN_SELECT = { id: true, guardianNo: true } as const;

async function makeUser(input: {
  companyId: string;
  email: string;
  role: string;
}) {
  const user = await prisma.user.create({
    data: {
      companyId: input.companyId,
      email: input.email,
      name: input.email,
      role: input.role as never,
    },
    select: { id: true },
  });
  return user.id;
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Portal Identity School ${stamp}`, slug: `portal-identity-${stamp}` },
  });
  companyId = company.id;

  const other = await prisma.company.create({
    data: { name: `Neighbouring School ${stamp}`, slug: `portal-neighbour-${stamp}` },
  });
  otherCompanyId = other.id;

  // Deliberately chosen so the old rule would have matched: the local part of
  // this address upper-cases to STU0001.
  moyoStudentUserId = await makeUser({
    companyId,
    email: `stu0001@portal-${stamp}.test`,
    role: "STUDENT",
  });
  moyoGuardianUserId = await makeUser({
    companyId,
    email: `moyo@portal-${stamp}.test`,
    role: "PARENT",
  });
  unlinkedUserId = await makeUser({
    companyId,
    email: `nobody@portal-${stamp}.test`,
    role: "STUDENT",
  });
  registrarUserId = await makeUser({
    companyId,
    email: `registrar@portal-${stamp}.test`,
    role: "REGISTRAR",
  });

  const moyoStudent = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: "STU0001",
      firstName: "Tendai",
      lastName: "Moyo",
      userId: moyoStudentUserId,
    },
    select: { id: true },
  });
  moyoStudentId = moyoStudent.id;

  const moyoGuardian = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: "GRD0001",
      firstName: "Rudo",
      lastName: "Moyo",
      phone: "+263771000001",
      // The same address the old parent rule matched on. It stays on the row —
      // it is contact detail — but it must no longer grant access.
      email: `moyo@portal-${stamp}.test`,
      userId: moyoGuardianUserId,
    },
    select: { id: true },
  });
  moyoGuardianId = moyoGuardian.id;

  const ncubeStudent = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: "STU0002",
      firstName: "Farai",
      lastName: "Ncube",
    },
    select: { id: true },
  });
  ncubeStudentId = ncubeStudent.id;

  const ncubeGuardian = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: "GRD0002",
      firstName: "Tapiwa",
      lastName: "Ncube",
      phone: "+263771000002",
      email: `moyo@portal-${stamp}.test`, // shared household address, on purpose
    },
    select: { id: true },
  });
  ncubeGuardianId = ncubeGuardian.id;

  await prisma.schoolStudentGuardian.create({
    data: {
      companyId,
      studentId: moyoStudentId,
      guardianId: moyoGuardianId,
      relationship: "MOTHER",
      isPrimary: true,
      canReceiveFinancials: true,
      canReceiveAcademicResults: false,
    },
  });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.company.delete({ where: { id: otherCompanyId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("student resolution", () => {
  it("resolves a claimed student by their account", async () => {
    const result = await resolvePortalStudent(
      { companyId, userId: moyoStudentUserId, role: "STUDENT" },
      { select: STUDENT_SELECT },
    );
    expect(result.kind).toBe("self");
    expect(result.subject?.id).toBe(moyoStudentId);
  });

  it("returns unlinked — never an arbitrary student — for an account with no record", async () => {
    const result = await resolvePortalStudent(
      { companyId, userId: unlinkedUserId, role: "STUDENT" },
      { select: STUDENT_SELECT },
    );
    expect(result.kind).toBe("unlinked");
    expect(result.subject).toBeNull();
  });

  it("refuses a student who names another student", async () => {
    const result = await resolvePortalStudent(
      {
        companyId,
        userId: moyoStudentUserId,
        role: "STUDENT",
        requestedId: ncubeStudentId,
      },
      { select: STUDENT_SELECT },
    );
    expect(result.kind).toBe("forbidden");
    expect(result.subject).toBeNull();
  });

  it("refuses an unlinked account that names a student", async () => {
    const result = await resolvePortalStudent(
      {
        companyId,
        userId: unlinkedUserId,
        role: "STUDENT",
        requestedId: moyoStudentId,
      },
      { select: STUDENT_SELECT },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("does not resolve a student whose studentNo matches the email local part", async () => {
    // The account is linked, so `self` is correct here. What must not happen is
    // the old behaviour: a *different* account whose email happens to be
    // stu0002@… reaching STU0002.
    const impostorId = await makeUser({
      companyId,
      email: `stu0002@impostor-${Date.now()}.test`,
      role: "STUDENT",
    });

    const result = await resolvePortalStudent(
      { companyId, userId: impostorId, role: "STUDENT" },
      { select: STUDENT_SELECT },
    );
    expect(result.kind).toBe("unlinked");
    expect(result.subject).toBeNull();
  });

  it("lets staff open a named student", async () => {
    const result = await resolvePortalStudent(
      {
        companyId,
        userId: registrarUserId,
        role: "REGISTRAR",
        requestedId: ncubeStudentId,
      },
      { select: STUDENT_SELECT },
    );
    expect(result.kind).toBe("oversight");
    expect(result.subject?.studentNo).toBe("STU0002");
  });

  it("does not let staff reach a student in another school", async () => {
    const foreignStudent = await prisma.schoolStudent.create({
      data: {
        companyId: otherCompanyId,
        studentNo: "STU9999",
        firstName: "Not",
        lastName: "Ours",
      },
      select: { id: true },
    });

    const result = await resolvePortalStudent(
      {
        companyId,
        userId: registrarUserId,
        role: "REGISTRAR",
        requestedId: foreignStudent.id,
      },
      { select: STUDENT_SELECT },
    );
    expect(result.kind).toBe("not-found");
    expect(result.subject).toBeNull();
  });
});

describe("guardian resolution", () => {
  it("resolves a claimed guardian by their account", async () => {
    const result = await resolvePortalGuardian(
      { companyId, userId: moyoGuardianUserId, role: "PARENT" },
      { select: GUARDIAN_SELECT },
    );
    expect(result.kind).toBe("self");
    expect(result.subject?.id).toBe(moyoGuardianId);
  });

  it("does not resolve the other guardian sharing the same email address", async () => {
    const result = await resolvePortalGuardian(
      { companyId, userId: moyoGuardianUserId, role: "PARENT" },
      { select: GUARDIAN_SELECT },
    );
    expect(result.subject?.id).not.toBe(ncubeGuardianId);
  });

  it("refuses a parent who names another guardian", async () => {
    const result = await resolvePortalGuardian(
      {
        companyId,
        userId: moyoGuardianUserId,
        role: "PARENT",
        requestedId: ncubeGuardianId,
      },
      { select: GUARDIAN_SELECT },
    );
    expect(result.kind).toBe("forbidden");
    expect(result.subject).toBeNull();
  });

  it("returns unlinked for a parent account nobody has claimed", async () => {
    const strangerId = await makeUser({
      companyId,
      email: `stranger-${Date.now()}@portal.test`,
      role: "PARENT",
    });

    const result = await resolvePortalGuardian(
      { companyId, userId: strangerId, role: "PARENT" },
      { select: GUARDIAN_SELECT },
    );
    expect(result.kind).toBe("unlinked");
  });
});

describe("guardian to child link", () => {
  it("returns the link with its consent flags", async () => {
    const link = await getGuardianChildLink({
      companyId,
      guardianId: moyoGuardianId,
      studentId: moyoStudentId,
    });
    expect(link?.canReceiveFinancials).toBe(true);
    expect(link?.canReceiveAcademicResults).toBe(false);
  });

  it("returns nothing for a child the guardian is not linked to", async () => {
    const link = await getGuardianChildLink({
      companyId,
      guardianId: moyoGuardianId,
      studentId: ncubeStudentId,
    });
    expect(link).toBeNull();
  });
});

describe("oversight roles", () => {
  it("recognises school staff and nobody else", () => {
    expect(canViewAnyPortalSubject("REGISTRAR")).toBe(true);
    expect(canViewAnyPortalSubject("BURSAR")).toBe(true);
    expect(canViewAnyPortalSubject("SCHOOL_ADMIN")).toBe(true);
    expect(canViewAnyPortalSubject("PARENT")).toBe(false);
    expect(canViewAnyPortalSubject("STUDENT")).toBe(false);
    expect(canViewAnyPortalSubject("TEACHER")).toBe(false);
    expect(canViewAnyPortalSubject(null)).toBe(false);
  });
});

describe("one account, one subject — MIGRATION WITNESS", () => {
  it("refuses to link one user to two students in a school", async () => {
    await expect(
      prisma.schoolStudent.create({
        data: {
          companyId,
          studentNo: "STU0003",
          firstName: "Second",
          lastName: "Claim",
          userId: moyoStudentUserId,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses to link one user to two guardians in a school", async () => {
    await expect(
      prisma.schoolGuardian.create({
        data: {
          companyId,
          guardianNo: "GRD0003",
          firstName: "Second",
          lastName: "Claim",
          phone: "+263771000003",
          userId: moyoGuardianUserId,
        },
      }),
    ).rejects.toThrow();
  });

  it("allows any number of unclaimed students and guardians", async () => {
    const a = await prisma.schoolStudent.create({
      data: { companyId, studentNo: "STU0010", firstName: "A", lastName: "Unclaimed" },
      select: { id: true, userId: true },
    });
    const b = await prisma.schoolStudent.create({
      data: { companyId, studentNo: "STU0011", firstName: "B", lastName: "Unclaimed" },
      select: { id: true, userId: true },
    });
    expect(a.userId).toBeNull();
    expect(b.userId).toBeNull();
  });
});

describe("guardian consent — a test per flag", () => {
  it("withholds financials when the flag is off, independently of results", async () => {
    const link = await prisma.schoolStudentGuardian.findFirst({
      where: { companyId, guardianId: moyoGuardianId, studentId: moyoStudentId },
      select: { id: true },
    });

    await prisma.schoolStudentGuardian.update({
      where: { id: link!.id },
      data: { canReceiveFinancials: false, canReceiveAcademicResults: true },
    });

    const fresh = await getGuardianChildLink({
      companyId,
      guardianId: moyoGuardianId,
      studentId: moyoStudentId,
    });

    expect(guardianMaySee(fresh!, "financials")).toBe(false);
    expect(guardianMaySee(fresh!, "academic-results")).toBe(true);
    expect(studentIdsWithConsent([{ ...fresh!, studentId: moyoStudentId }], "financials")).toEqual([]);
    expect(
      studentIdsWithConsent([{ ...fresh!, studentId: moyoStudentId }], "academic-results"),
    ).toEqual([moyoStudentId]);
  });

  it("withholds results when the flag is off, independently of financials", async () => {
    const link = await prisma.schoolStudentGuardian.findFirst({
      where: { companyId, guardianId: moyoGuardianId, studentId: moyoStudentId },
      select: { id: true },
    });

    await prisma.schoolStudentGuardian.update({
      where: { id: link!.id },
      data: { canReceiveFinancials: true, canReceiveAcademicResults: false },
    });

    const fresh = await getGuardianChildLink({
      companyId,
      guardianId: moyoGuardianId,
      studentId: moyoStudentId,
    });

    expect(guardianMaySee(fresh!, "academic-results")).toBe(false);
    expect(guardianMaySee(fresh!, "financials")).toBe(true);
  });

  it("filters a mixed set of children per flag", () => {
    const links = [
      {
        studentId: "child-a",
        canReceiveFinancials: true,
        canReceiveAcademicResults: false,
      },
      {
        studentId: "child-b",
        canReceiveFinancials: false,
        canReceiveAcademicResults: true,
      },
    ];

    // A guardian may be on the financial list for one child and the academic
    // list for another. Consent is per relationship, not per person.
    expect(studentIdsWithConsent(links, "financials")).toEqual(["child-a"]);
    expect(studentIdsWithConsent(links, "academic-results")).toEqual(["child-b"]);
  });

  it("says which kind of visibility was withheld", () => {
    expect(consentDeniedMessage("financials")).toContain("Financial");
    expect(consentDeniedMessage("academic-results")).toContain("Academic");
  });
});
