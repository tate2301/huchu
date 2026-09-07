/**
 * Student goals and parent meetings.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  bookMeeting,
  goalsForStudent,
  GoalError,
  meetingSchedule,
  MeetingError,
  openMeetingSlots,
  releaseMeeting,
  saveGoal,
} from "./goals-meetings";

let companyId: string;
let termId: string;
let classId: string;
let subjectId: string;
let teacherProfileId: string;
let studentAId: string;
let studentBId: string;

function at(iso: string) {
  return new Date(`${iso}:00.000Z`);
}
function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

let counter = 0;
async function makeStudent() {
  counter += 1;
  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `G${String(counter).padStart(4, "0")}`,
      firstName: `Child${counter}`,
      lastName: `Goal${counter}`,
      status: "ACTIVE",
      currentClassId: classId,
    },
    select: { id: true },
  });
  return student.id;
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Goals Test ${stamp}`, slug: `goals-test-${stamp}` },
  });
  companyId = company.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: "2026",
      name: "2026",
      startDate: date("2026-01-01"),
      endDate: date("2026-12-31"),
    },
  });
  termId = (
    await prisma.schoolTerm.create({
      data: {
        companyId,
        academicYearId: year.id,
        code: "T1",
        name: "Term 1",
        startDate: date("2026-01-08"),
        endDate: date("2026-04-10"),
        isActive: true,
      },
    })
  ).id;
  classId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F1", name: "Form 1", level: 1 },
    })
  ).id;
  subjectId = (
    await prisma.schoolSubject.create({
      data: { companyId, code: "MAT", name: "Mathematics" },
    })
  ).id;

  const user = await prisma.user.create({
    data: {
      companyId,
      email: `goals-teacher-${stamp}@test.test`,
      name: "Ms Banda",
      role: "TEACHER",
    },
  });
  teacherProfileId = (
    await prisma.schoolTeacherProfile.create({
      data: { companyId, userId: user.id, employeeCode: "T001" },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.schoolParentMeeting.deleteMany({ where: { companyId } });
  await prisma.schoolStudentGoal.deleteMany({ where: { companyId } });
  await prisma.schoolResultLine.deleteMany({ where: { companyId } });
  await prisma.schoolResultSheet.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
  studentAId = await makeStudent();
  studentBId = await makeStudent();
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("saveGoal", () => {
  it("records a target and how they will get there", async () => {
    const goal = await saveGoal({
      companyId,
      studentId: studentAId,
      termId,
      subjectId,
      targetMark: 70,
      plan: "Two past papers a week",
      baselineMark: 54,
    });
    expect(Number(goal.targetMark)).toBe(70);
    expect(Number(goal.baselineMark)).toBe(54);
  });

  it("changes the same goal rather than setting a second", async () => {
    // Two goals for one subject leave a progress screen picking between them.
    await saveGoal({ companyId, studentId: studentAId, termId, subjectId, targetMark: 60 });
    await saveGoal({ companyId, studentId: studentAId, termId, subjectId, targetMark: 75 });
    const rows = await prisma.schoolStudentGoal.findMany({
      where: { companyId, studentId: studentAId },
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].targetMark)).toBe(75);
  });

  it("keeps the baseline from when the goal was first set", async () => {
    // Without it, "aiming for 70" says nothing about whether that is ambitious.
    await saveGoal({
      companyId,
      studentId: studentAId,
      termId,
      subjectId,
      targetMark: 70,
      baselineMark: 40,
    });
    const revised = await saveGoal({
      companyId,
      studentId: studentAId,
      termId,
      subjectId,
      targetMark: 80,
      baselineMark: 65,
    });
    expect(Number(revised.baselineMark)).toBe(40);
  });

  it("refuses a target that is not a percentage", async () => {
    await expect(
      saveGoal({ companyId, studentId: studentAId, termId, subjectId, targetMark: 140 }),
    ).rejects.toThrow(GoalError);
  });

  it("refuses two goals for one subject and term — MIGRATION WITNESS", async () => {
    await prisma.schoolStudentGoal.create({
      data: { companyId, studentId: studentAId, termId, subjectId },
    });
    await expect(
      prisma.schoolStudentGoal.create({
        data: { companyId, studentId: studentAId, termId, subjectId },
      }),
    ).rejects.toThrow();
  });
});

describe("goalsForStudent", () => {
  it("says nothing about being on track when there is no mark yet", async () => {
    // "On track" against no mark is a claim nothing supports.
    await saveGoal({ companyId, studentId: studentAId, termId, subjectId, targetMark: 70 });
    const goals = await goalsForStudent({ companyId, studentId: studentAId, termId });
    expect(goals[0].currentMark).toBeNull();
    expect(goals[0].onTrack).toBeNull();
  });

  it("compares the goal against the term mark", async () => {
    await saveGoal({ companyId, studentId: studentAId, termId, subjectId, targetMark: 70 });
    const sheet = await prisma.schoolResultSheet.create({
      data: { companyId, termId, classId, title: "T1" },
    });
    await prisma.schoolResultLine.create({
      data: {
        companyId,
        sheetId: sheet.id,
        studentId: studentAId,
        subjectCode: "MAT",
        score: 74,
      },
    });

    const goals = await goalsForStudent({ companyId, studentId: studentAId, termId });
    expect(goals[0].currentMark).toBe(74);
    expect(goals[0].onTrack).toBe(true);
  });
});

describe("openMeetingSlots", () => {
  it("creates a row per slot, all free", async () => {
    // Free slots as rows is what lets a parent see when the teacher is
    // available; a list of bookings can only show when they are not.
    const result = await openMeetingSlots({
      companyId,
      teacherProfileId,
      from: at("2026-03-10T17:00"),
      to: at("2026-03-10T18:00"),
      minutesEach: 10,
      location: "Room 4",
    });
    expect(result.created).toBe(6);

    const schedule = await meetingSchedule({
      companyId,
      teacherProfileId,
      from: at("2026-03-10T00:00"),
      to: at("2026-03-11T00:00"),
    });
    expect(schedule).toHaveLength(6);
    expect(schedule.every((slot) => slot.bookedAt === null)).toBe(true);
  });

  it("does not double up when the evening is opened twice", async () => {
    const input = {
      companyId,
      teacherProfileId,
      from: at("2026-03-10T17:00"),
      to: at("2026-03-10T18:00"),
      minutesEach: 10,
    };
    await openMeetingSlots(input);
    const second = await openMeetingSlots(input);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(6);
  });

  it("refuses a window shorter than one slot", async () => {
    await expect(
      openMeetingSlots({
        companyId,
        teacherProfileId,
        from: at("2026-03-10T17:00"),
        to: at("2026-03-10T17:05"),
        minutesEach: 10,
      }),
    ).rejects.toThrow(/shorter than one slot/);
  });

  it("refuses an evening that ends before it starts", async () => {
    await expect(
      openMeetingSlots({
        companyId,
        teacherProfileId,
        from: at("2026-03-10T18:00"),
        to: at("2026-03-10T17:00"),
        minutesEach: 10,
      }),
    ).rejects.toThrow(MeetingError);
  });

  it("refuses two live slots at one time — MIGRATION WITNESS", async () => {
    const data = {
      companyId,
      teacherProfileId,
      startsAt: at("2026-03-10T17:00"),
      endsAt: at("2026-03-10T17:10"),
    };
    await prisma.schoolParentMeeting.create({ data });
    await expect(prisma.schoolParentMeeting.create({ data })).rejects.toThrow();
  });

  it("refuses a booking with nobody's name on it — MIGRATION WITNESS", async () => {
    // A slot that looks taken and names nobody cannot be chased.
    await expect(
      prisma.schoolParentMeeting.create({
        data: {
          companyId,
          teacherProfileId,
          startsAt: at("2026-03-11T17:00"),
          endsAt: at("2026-03-11T17:10"),
          bookedAt: at("2026-03-01T09:00"),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("bookMeeting", () => {
  it("takes a free slot", async () => {
    await openMeetingSlots({
      companyId,
      teacherProfileId,
      from: at("2026-03-10T17:00"),
      to: at("2026-03-10T17:20"),
      minutesEach: 10,
    });
    const slot = await prisma.schoolParentMeeting.findFirstOrThrow({
      where: { companyId },
      orderBy: { startsAt: "asc" },
    });

    const booked = await bookMeeting({
      companyId,
      meetingId: slot.id,
      studentId: studentAId,
    });
    expect(booked.bookedAt).not.toBeNull();
    expect(booked.studentId).toBe(studentAId);
  });

  it("refuses a slot somebody else has taken", async () => {
    await openMeetingSlots({
      companyId,
      teacherProfileId,
      from: at("2026-03-10T17:00"),
      to: at("2026-03-10T17:10"),
      minutesEach: 10,
    });
    const slot = await prisma.schoolParentMeeting.findFirstOrThrow({
      where: { companyId },
    });
    await bookMeeting({ companyId, meetingId: slot.id, studentId: studentAId });
    await expect(
      bookMeeting({ companyId, meetingId: slot.id, studentId: studentBId }),
    ).rejects.toThrow(/already taken/);
  });

  it("frees the slot again when a booking is released", async () => {
    await openMeetingSlots({
      companyId,
      teacherProfileId,
      from: at("2026-03-10T17:00"),
      to: at("2026-03-10T17:10"),
      minutesEach: 10,
    });
    const slot = await prisma.schoolParentMeeting.findFirstOrThrow({
      where: { companyId },
    });
    await bookMeeting({ companyId, meetingId: slot.id, studentId: studentAId });
    const released = await releaseMeeting({ companyId, meetingId: slot.id });
    expect(released.bookedAt).toBeNull();

    const again = await bookMeeting({
      companyId,
      meetingId: slot.id,
      studentId: studentBId,
    });
    expect(again.studentId).toBe(studentBId);
  });

  it("refuses to release a slot nobody has booked", async () => {
    await openMeetingSlots({
      companyId,
      teacherProfileId,
      from: at("2026-03-10T17:00"),
      to: at("2026-03-10T17:10"),
      minutesEach: 10,
    });
    const slot = await prisma.schoolParentMeeting.findFirstOrThrow({
      where: { companyId },
    });
    await expect(
      releaseMeeting({ companyId, meetingId: slot.id }),
    ).rejects.toThrow(/already free/);
  });
});

describe("meetingSchedule", () => {
  let secondTeacherProfileId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        companyId,
        email: `goals-teacher-2-${Date.now()}@test.test`,
        name: "Mr Moyo",
        role: "TEACHER",
      },
    });
    secondTeacherProfileId = (
      await prisma.schoolTeacherProfile.create({
        data: { companyId, userId: user.id, employeeCode: "T002" },
      })
    ).id;
  });

  it("returns every teacher's evening when no teacher is named", async () => {
    // The office runs a parents' evening across the whole staff room. A
    // schedule that could only be asked for one teacher at a time would make
    // "who still has free slots on Thursday" a question nobody can answer
    // without opening thirty screens.
    await openMeetingSlots({
      companyId,
      teacherProfileId,
      from: at("2026-03-12T17:00"),
      to: at("2026-03-12T17:30"),
      minutesEach: 10,
    });
    await openMeetingSlots({
      companyId,
      teacherProfileId: secondTeacherProfileId,
      from: at("2026-03-12T17:00"),
      to: at("2026-03-12T17:20"),
      minutesEach: 10,
    });

    const schedule = await meetingSchedule({
      companyId,
      from: at("2026-03-12T00:00"),
      to: at("2026-03-13T00:00"),
    });
    expect(schedule).toHaveLength(5);
    expect(new Set(schedule.map((slot) => slot.teacherProfile.id))).toEqual(
      new Set([teacherProfileId, secondTeacherProfileId]),
    );

    // Naming one teacher still narrows to theirs, so the teacher's own screen
    // is unaffected by the office being able to see everybody's.
    const mine = await meetingSchedule({
      companyId,
      teacherProfileId: secondTeacherProfileId,
      from: at("2026-03-12T00:00"),
      to: at("2026-03-13T00:00"),
    });
    expect(mine).toHaveLength(2);
  });

  it("names the guardian on a booked slot, not only the pupil", async () => {
    // A cancellation is chased by ringing an adult. The child's name and
    // student number cannot be dialled, so a schedule that carried only the
    // pupil left the office looking the guardian up by hand for every row.
    counter += 1;
    const guardian = await prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo: `PG${String(counter).padStart(4, "0")}`,
        firstName: "Rudo",
        lastName: "Chikafu",
        phone: "0772000111",
      },
      select: { id: true },
    });

    await openMeetingSlots({
      companyId,
      teacherProfileId,
      from: at("2026-03-13T17:00"),
      to: at("2026-03-13T17:20"),
      minutesEach: 10,
    });
    const slots = await prisma.schoolParentMeeting.findMany({
      where: { companyId, startsAt: { gte: at("2026-03-13T00:00") } },
      orderBy: { startsAt: "asc" },
      select: { id: true },
    });
    await bookMeeting({
      companyId,
      meetingId: slots[0]!.id,
      studentId: studentAId,
      guardianId: guardian.id,
    });

    const schedule = await meetingSchedule({
      companyId,
      from: at("2026-03-13T00:00"),
      to: at("2026-03-14T00:00"),
    });
    const booked = schedule.find((slot) => slot.bookedAt !== null);
    expect(booked?.guardian).toMatchObject({
      firstName: "Rudo",
      lastName: "Chikafu",
      phone: "0772000111",
    });
    // The pupil still carries their class, which is what lets the office
    // filter an evening down to one year group.
    expect(booked?.student?.currentClass?.id).toBe(classId);

    // And the free slot alongside it names nobody at all — that is the row a
    // parent can still take.
    const free = schedule.find((slot) => slot.bookedAt === null);
    expect(free?.guardian).toBeNull();
    expect(free?.student).toBeNull();
  });
});
