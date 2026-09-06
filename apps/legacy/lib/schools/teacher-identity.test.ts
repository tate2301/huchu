/**
 * Teacher and employee as one person.
 *
 * The tests are mostly about what the link refuses, because the failure this
 * story guards against is a *wrong* link — one teacher's payslip against
 * another's classes — which is worse than no link at all.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  linkTeacherToEmployee,
  suggestEmployeesForTeacher,
  TeacherLinkError,
  teacherLinkCoverage,
  unlinkTeacherFromEmployee,
} from "./teacher-identity";

let companyId: string;
let otherCompanyId: string;
let bandaUserId: string;
let bandaProfileId: string;

let sequence = 0;
async function makeEmployee(input: {
  name: string;
  userId?: string | null;
  companyId?: string;
}) {
  sequence += 1;
  return prisma.employee.create({
    data: {
      companyId: input.companyId ?? companyId,
      employeeId: `E${String(sequence).padStart(4, "0")}`,
      name: input.name,
      phone: "+263771000000",
      nextOfKinName: "Kin",
      nextOfKinPhone: "+263772000000",
      passportPhotoUrl: "https://example.test/photo.jpg",
      villageOfOrigin: "Chivhu",
      jobTitle: "Teacher",
      userId: input.userId ?? null,
    },
    select: { id: true, name: true },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Teacher Link ${stamp}`, slug: `teacher-link-${stamp}` },
  });
  companyId = company.id;
  const other = await prisma.company.create({
    data: { name: `Other ${stamp}`, slug: `other-teacher-link-${stamp}` },
  });
  otherCompanyId = other.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      email: `banda-${stamp}@teacher.test`,
      name: "Grace Banda",
      role: "TEACHER",
    },
  });
  bandaUserId = user.id;
});

beforeEach(async () => {
  await prisma.schoolTeacherProfile.deleteMany({ where: { companyId } });
  await prisma.employee.deleteMany({ where: { companyId } });
  await prisma.employee.deleteMany({ where: { companyId: otherCompanyId } });

  const profile = await prisma.schoolTeacherProfile.create({
    data: { companyId, userId: bandaUserId, employeeCode: "T001" },
    select: { id: true },
  });
  bandaProfileId = profile.id;
});

afterAll(async () => {
  for (const id of [companyId, otherCompanyId]) {
    await prisma.company.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("suggestEmployeesForTeacher", () => {
  it("offers the same login as certain", async () => {
    await makeEmployee({ name: "G. Banda", userId: bandaUserId });
    const suggestions = await suggestEmployeesForTeacher({
      companyId,
      teacherProfileId: bandaProfileId,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].confidence).toBe("certain");
    expect(suggestions[0].reason).toBe("Same login");
  });

  it("offers an exact name as likely, with a warning attached", async () => {
    await makeEmployee({ name: "Grace Banda" });
    const suggestions = await suggestEmployeesForTeacher({
      companyId,
      teacherProfileId: bandaProfileId,
    });
    expect(suggestions[0].confidence).toBe("likely");
    expect(suggestions[0].reason).toContain("check before linking");
  });

  it("puts the login match above the name match", async () => {
    // A screen that lists a name match first invites somebody to take the
    // weaker one.
    await makeEmployee({ name: "Grace Banda" });
    await makeEmployee({ name: "G. Banda", userId: bandaUserId });
    const suggestions = await suggestEmployeesForTeacher({
      companyId,
      teacherProfileId: bandaProfileId,
    });
    expect(suggestions[0].confidence).toBe("certain");
  });

  it("offers nothing on a near-miss rather than guessing", async () => {
    // No fuzzy matching by design: six half-right names is a screen where
    // somebody picks the wrong one.
    await makeEmployee({ name: "Grace Bandah" });
    await makeEmployee({ name: "Gracie Banda" });
    const suggestions = await suggestEmployeesForTeacher({
      companyId,
      teacherProfileId: bandaProfileId,
    });
    expect(suggestions).toHaveLength(0);
  });

  it("leaves out an employee another teacher already has", async () => {
    const employee = await makeEmployee({ name: "Grace Banda" });
    const otherUser = await prisma.user.create({
      data: {
        companyId,
        email: `other-${Date.now()}@teacher.test`,
        name: "Someone Else",
        role: "TEACHER",
      },
    });
    await prisma.schoolTeacherProfile.create({
      data: {
        companyId,
        userId: otherUser.id,
        employeeCode: "T002",
        employeeId: employee.id,
      },
    });

    const suggestions = await suggestEmployeesForTeacher({
      companyId,
      teacherProfileId: bandaProfileId,
    });
    expect(suggestions).toHaveLength(0);
  });

  it("offers nothing once the teacher is already linked", async () => {
    const employee = await makeEmployee({ name: "Grace Banda", userId: bandaUserId });
    await linkTeacherToEmployee({
      companyId,
      teacherProfileId: bandaProfileId,
      employeeId: employee.id,
    });
    expect(
      await suggestEmployeesForTeacher({ companyId, teacherProfileId: bandaProfileId }),
    ).toHaveLength(0);
  });
});

describe("linkTeacherToEmployee", () => {
  it("binds the two records", async () => {
    const employee = await makeEmployee({ name: "Grace Banda" });
    const linked = await linkTeacherToEmployee({
      companyId,
      teacherProfileId: bandaProfileId,
      employeeId: employee.id,
    });
    expect(linked.employeeId).toBe(employee.id);
  });

  it("refuses an employee from another company", async () => {
    const employee = await makeEmployee({
      name: "Grace Banda",
      companyId: otherCompanyId,
    });
    await expect(
      linkTeacherToEmployee({
        companyId,
        teacherProfileId: bandaProfileId,
        employeeId: employee.id,
      }),
    ).rejects.toThrow(/not on this school/i);
  });

  it("refuses an employee whose login belongs to somebody else", async () => {
    // The case where the link looks right and is wrong: both records carry a
    // plausible name, and only the account says they are different people.
    const stranger = await prisma.user.create({
      data: {
        companyId,
        email: `stranger-${Date.now()}@teacher.test`,
        name: "Grace Banda",
        role: "TEACHER",
      },
    });
    const employee = await makeEmployee({ name: "Grace Banda", userId: stranger.id });
    await expect(
      linkTeacherToEmployee({
        companyId,
        teacherProfileId: bandaProfileId,
        employeeId: employee.id,
      }),
    ).rejects.toThrow(/different login/i);
  });

  it("refuses an employee another teacher already has", async () => {
    const employee = await makeEmployee({ name: "Grace Banda" });
    const otherUser = await prisma.user.create({
      data: {
        companyId,
        email: `taken-${Date.now()}@teacher.test`,
        name: "Taken",
        role: "TEACHER",
      },
    });
    await prisma.schoolTeacherProfile.create({
      data: {
        companyId,
        userId: otherUser.id,
        employeeCode: "T003",
        employeeId: employee.id,
      },
    });

    await expect(
      linkTeacherToEmployee({
        companyId,
        teacherProfileId: bandaProfileId,
        employeeId: employee.id,
      }),
    ).rejects.toThrow(TeacherLinkError);
  });

  it("refuses two teacher profiles pointing at one employee — MIGRATION WITNESS", async () => {
    const employee = await makeEmployee({ name: "Grace Banda" });
    await prisma.schoolTeacherProfile.update({
      where: { id: bandaProfileId },
      data: { employeeId: employee.id },
    });
    const otherUser = await prisma.user.create({
      data: {
        companyId,
        email: `dup-${Date.now()}@teacher.test`,
        name: "Duplicate",
        role: "TEACHER",
      },
    });
    await expect(
      prisma.schoolTeacherProfile.create({
        data: {
          companyId,
          userId: otherUser.id,
          employeeCode: "T004",
          employeeId: employee.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("is idempotent when the link is already the one asked for", async () => {
    const employee = await makeEmployee({ name: "Grace Banda" });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await linkTeacherToEmployee({
        companyId,
        teacherProfileId: bandaProfileId,
        employeeId: employee.id,
      });
    }
    const profile = await prisma.schoolTeacherProfile.findUniqueOrThrow({
      where: { id: bandaProfileId },
    });
    expect(profile.employeeId).toBe(employee.id);
  });

  it("keeps both records when the link is broken", async () => {
    const employee = await makeEmployee({ name: "Grace Banda" });
    await linkTeacherToEmployee({
      companyId,
      teacherProfileId: bandaProfileId,
      employeeId: employee.id,
    });
    await unlinkTeacherFromEmployee({ companyId, teacherProfileId: bandaProfileId });

    expect(
      await prisma.employee.count({ where: { id: employee.id } }),
    ).toBe(1);
    const profile = await prisma.schoolTeacherProfile.findUniqueOrThrow({
      where: { id: bandaProfileId },
    });
    expect(profile.employeeId).toBeNull();
  });
});

describe("teacherLinkCoverage", () => {
  it("counts how much of the staff list is joined up", async () => {
    const employee = await makeEmployee({ name: "Grace Banda" });
    let coverage = await teacherLinkCoverage(companyId);
    expect(coverage).toEqual({ total: 1, linked: 0, unlinked: 1 });

    await linkTeacherToEmployee({
      companyId,
      teacherProfileId: bandaProfileId,
      employeeId: employee.id,
    });
    coverage = await teacherLinkCoverage(companyId);
    expect(coverage).toEqual({ total: 1, linked: 1, unlinked: 0 });
  });
});
