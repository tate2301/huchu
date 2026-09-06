/**
 * Sending a notice, and who it reaches.
 *
 * The audience is the whole risk here. A notice is not recallable: writing to
 * "everyone" when the head meant "the Form 2 parents" is a mistake that has
 * already happened by the time anybody notices, so these tests pin who each
 * audience resolves to rather than that a row was written.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  listSentNotices,
  NoticeError,
  resolveNoticeAudience,
  sendSchoolNotice,
} from "./notices";

let companyId: string;
let headUserId: string;
let formOneId: string;
let formTwoId: string;
let motherUserId: string;
let fatherUserId: string;
let uninvitedGuardianId: string;
let pupilOneUserId: string;
let teacherUserId: string;
let stamp: number;

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Notice Test ${stamp}`, slug: `notice-test-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const user = (email: string, role: "SCHOOL_ADMIN" | "PARENT" | "STUDENT" | "TEACHER") =>
    prisma.user.create({
      data: { companyId, email: `${email}-${stamp}@notice.test`, name: email, role },
      select: { id: true },
    });

  headUserId = (await user("head", "SCHOOL_ADMIN")).id;
  motherUserId = (await user("mother", "PARENT")).id;
  fatherUserId = (await user("father", "PARENT")).id;
  pupilOneUserId = (await user("pupil-one", "STUDENT")).id;
  const teacherAccount = await user("teacher", "TEACHER");
  teacherUserId = teacherAccount.id;

  formOneId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F1", name: "Form 1", level: 1 },
      select: { id: true },
    })
  ).id;
  formTwoId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F2", name: "Form 2", level: 2 },
      select: { id: true },
    })
  ).id;

  // Form 1: one pupil with a portal account, whose mother has one too.
  const pupilOne = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `S1-${stamp}`,
      firstName: "Anesu",
      lastName: "Moyo",
      status: "ACTIVE",
      currentClassId: formOneId,
      userId: pupilOneUserId,
    },
    select: { id: true },
  });
  // Form 2: one pupil with no account, whose father has one.
  const pupilTwo = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `S2-${stamp}`,
      firstName: "Tendai",
      lastName: "Banda",
      status: "ACTIVE",
      currentClassId: formTwoId,
    },
    select: { id: true },
  });

  const mother = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: `G1-${stamp}`,
      firstName: "Rudo",
      lastName: "Moyo",
      phone: "0772000001",
      userId: motherUserId,
    },
    select: { id: true },
  });
  const father = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: `G2-${stamp}`,
      firstName: "Farai",
      lastName: "Banda",
      phone: "0772000002",
      userId: fatherUserId,
    },
    select: { id: true },
  });
  // Never invited: no userId at all.
  const uninvited = await prisma.schoolGuardian.create({
    data: {
      companyId,
      guardianNo: `G3-${stamp}`,
      firstName: "Grace",
      lastName: "Ncube",
      phone: "0772000003",
    },
    select: { id: true },
  });
  uninvitedGuardianId = uninvited.id;

  await prisma.schoolStudentGuardian.createMany({
    data: [
      { companyId, studentId: pupilOne.id, guardianId: mother.id, relationship: "MOTHER", isPrimary: true },
      { companyId, studentId: pupilTwo.id, guardianId: father.id, relationship: "FATHER", isPrimary: true },
      // The uninvited guardian is a second contact on the Form 1 pupil.
      { companyId, studentId: pupilOne.id, guardianId: uninvited.id, relationship: "OTHER" },
    ],
  });

  await prisma.schoolTeacherProfile.create({
    data: { companyId, userId: teacherUserId, employeeCode: `T-${stamp}` },
  });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
});

describe("who a notice reaches", () => {
  it("writes to every guardian with an account, and counts those without", async () => {
    const { userIds, withoutAccount } = await resolveNoticeAudience({
      companyId,
      audience: "PARENTS",
    });
    expect(userIds.sort()).toEqual([motherUserId, fatherUserId].sort());
    // Grace was never invited: she is not a recipient, and she is not silently
    // dropped either — the office needs to know a family was not told.
    expect(withoutAccount).toBe(1);
  });

  it("narrows parents to the year group asked for", async () => {
    const { userIds } = await resolveNoticeAudience({
      companyId,
      audience: "PARENTS",
      classId: formTwoId,
    });
    // Form 2's father only. Form 1's mother is a different family's business.
    expect(userIds).toEqual([fatherUserId]);
  });

  it("counts a guardian once however many children they have", async () => {
    const second = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S3-${stamp}`,
        firstName: "Kudzai",
        lastName: "Moyo",
        status: "ACTIVE",
        currentClassId: formOneId,
      },
      select: { id: true },
    });
    const mother = await prisma.schoolGuardian.findFirstOrThrow({
      where: { companyId, userId: motherUserId },
      select: { id: true },
    });
    await prisma.schoolStudentGuardian.create({
      data: { companyId, studentId: second.id, guardianId: mother.id, relationship: "MOTHER" },
    });

    const { userIds } = await resolveNoticeAudience({ companyId, audience: "PARENTS" });
    expect(userIds.filter((id) => id === motherUserId)).toHaveLength(1);

    await prisma.schoolStudent.delete({ where: { id: second.id } });
  });

  it("leaves out a pupil who has no portal account", async () => {
    const { userIds, withoutAccount } = await resolveNoticeAudience({
      companyId,
      audience: "STUDENTS",
    });
    expect(userIds).toEqual([pupilOneUserId]);
    expect(withoutAccount).toBe(1);
  });

  it("reaches teachers, who always have an account", async () => {
    const { userIds, withoutAccount } = await resolveNoticeAudience({
      companyId,
      audience: "TEACHERS",
    });
    expect(userIds).toEqual([teacherUserId]);
    expect(withoutAccount).toBe(0);
  });

  it("addresses everyone without writing to anybody twice", async () => {
    const { userIds } = await resolveNoticeAudience({ companyId, audience: "ALL" });
    expect(new Set(userIds).size).toBe(userIds.length);
    expect(userIds.sort()).toEqual(
      [motherUserId, fatherUserId, pupilOneUserId, teacherUserId].sort(),
    );
  });

  it("does not write to a pupil who has left", async () => {
    const leaver = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S4-${stamp}`,
        firstName: "Tapiwa",
        lastName: "Gone",
        status: "WITHDRAWN",
        currentClassId: formOneId,
        userId: (
          await prisma.user.create({
            data: {
              companyId,
              email: `leaver-${stamp}@notice.test`,
              name: "Leaver",
              role: "STUDENT",
            },
            select: { id: true },
          })
        ).id,
      },
      select: { id: true, userId: true },
    });

    const { userIds } = await resolveNoticeAudience({ companyId, audience: "STUDENTS" });
    expect(userIds).not.toContain(leaver.userId);

    await prisma.schoolStudent.delete({ where: { id: leaver.id } });
  });
});

describe("sending", () => {
  it("writes one notification and a row per recipient", async () => {
    const result = await sendSchoolNotice({
      companyId,
      senderUserId: headUserId,
      title: "Sports day moved to Friday",
      body: "The gala is now Friday 12th, starting at 8am.",
      audience: "PARENTS",
    });

    expect(result.recipients).toBe(2);
    expect(result.withoutAccount).toBe(1);

    const rows = await prisma.notificationRecipient.findMany({
      where: { notificationId: result.id },
      select: { userId: true, isRead: true },
    });
    expect(rows).toHaveLength(2);
    // A notice arrives unread, which is what makes the parent's badge mean
    // something.
    expect(rows.every((row) => !row.isRead)).toBe(true);
  });

  it("types the notice by its audience, which is how the portals label it", async () => {
    const result = await sendSchoolNotice({
      companyId,
      senderUserId: headUserId,
      title: "Staff briefing",
      body: "Tuesday, 7am, staff room.",
      audience: "TEACHERS",
    });
    const notice = await prisma.notification.findUniqueOrThrow({
      where: { id: result.id },
      select: { type: true },
    });
    expect(notice.type).toBe("SCHOOL_NOTICE_TEACHERS");
  });

  it("refuses rather than sending a notice nobody will get", async () => {
    // A year group whose only family has never been invited.
    const emptyClass = await prisma.schoolClass.create({
      data: { companyId, code: `F9-${stamp % 1000}`, name: "Form 9", level: 9 },
      select: { id: true },
    });
    const orphan = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S9-${stamp}`,
        firstName: "Nobody",
        lastName: "Here",
        status: "ACTIVE",
        currentClassId: emptyClass.id,
      },
      select: { id: true },
    });
    await prisma.schoolStudentGuardian.create({
      data: {
        companyId,
        studentId: orphan.id,
        guardianId: uninvitedGuardianId,
        relationship: "OTHER",
      },
    });

    await expect(
      sendSchoolNotice({
        companyId,
        senderUserId: headUserId,
        title: "Nobody will read this",
        body: "…",
        audience: "PARENTS",
        classId: emptyClass.id,
      }),
    ).rejects.toThrow(NoticeError);

    await prisma.schoolStudent.delete({ where: { id: orphan.id } });
    await prisma.schoolClass.delete({ where: { id: emptyClass.id } });
  });

  it("reports how far a notice got, not just that it went", async () => {
    const sent = await sendSchoolNotice({
      companyId,
      senderUserId: headUserId,
      title: "Fees due Friday",
      body: "Term 2 fees close on Friday.",
      audience: "PARENTS",
    });
    await prisma.notificationRecipient.updateMany({
      where: { notificationId: sent.id, userId: motherUserId },
      data: { isRead: true, readAt: new Date() },
    });

    const [notice] = await listSentNotices({ companyId });
    expect(notice.title).toBe("Fees due Friday");
    expect(notice.audience).toBe("Parents");
    expect(notice.recipients).toBe(2);
    // One of two has opened it — the only honest measure of whether it landed.
    expect(notice.read).toBe(1);
  });
});
