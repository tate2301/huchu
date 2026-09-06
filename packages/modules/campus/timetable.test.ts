/**
 * Timetable invariants.
 *
 * The clash rules are database constraints (migration
 * 20260804160000_school_timetable), not application checks, so the tests that
 * assert them are migration witnesses: they insert past the service layer and
 * fail if someone drops an index and leaves the service alone. The tests that
 * go through the service assert the *sentence* a timetabler reads, which the
 * constraint alone cannot give them.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migration applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  allocateTeacherToClasses,
  autoFillTimetable,
  copyTimetableToTerm,
  createTimetableSlot,
  findOverlappingPeriod,
  findSlotConflicts,
  formatMinute,
  isValidPeriodRange,
  parseMinute,
  periodsOverlap,
  syncSlotDenormalisation,
} from "./timetable";

let companyId: string;
let termId: string;
let otherTermId: string;
let classId: string;
let streamId: string;
let subjectAId: string;
let subjectBId: string;
let teacherAId: string;
let teacherBId: string;
let periodOneId: string;
let periodTwoId: string;
let breakPeriodId: string;
let roomId: string;
let otherRoomId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function makeAssignment(input: {
  subjectId: string;
  teacherProfileId: string;
  classId?: string;
  streamId?: string | null;
  termId?: string;
}) {
  return prisma.schoolClassSubject.create({
    data: {
      companyId,
      termId: input.termId ?? termId,
      classId: input.classId ?? classId,
      streamId: input.streamId === undefined ? streamId : input.streamId,
      subjectId: input.subjectId,
      teacherProfileId: input.teacherProfileId,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();

  const company = await prisma.company.create({
    data: { name: `Timetable Test ${stamp}`, slug: `timetable-test-${stamp}` },
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
  const term = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T1",
      name: "Term 1",
      startDate: date("2026-01-08"),
      endDate: date("2026-04-10"),
    },
  });
  termId = term.id;
  const other = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T2",
      name: "Term 2",
      startDate: date("2026-05-06"),
      endDate: date("2026-08-08"),
    },
  });
  otherTermId = other.id;

  const schoolClass = await prisma.schoolClass.create({
    data: { companyId, code: "F1", name: "Form 1", level: 8 },
  });
  classId = schoolClass.id;
  const stream = await prisma.schoolStream.create({
    data: { companyId, classId, code: "A", name: "Form 1A" },
  });
  streamId = stream.id;

  const subjectA = await prisma.schoolSubject.create({
    data: { companyId, code: "MAT", name: "Mathematics" },
  });
  subjectAId = subjectA.id;
  const subjectB = await prisma.schoolSubject.create({
    data: { companyId, code: "ENG", name: "English" },
  });
  subjectBId = subjectB.id;

  const userA = await prisma.user.create({
    data: {
      companyId,
      email: `teacher-a-${stamp}@timetable.test`,
      name: "Ms Banda",
      role: "TEACHER",
    },
  });
  const userB = await prisma.user.create({
    data: {
      companyId,
      email: `teacher-b-${stamp}@timetable.test`,
      name: "Mr Chirwa",
      role: "TEACHER",
    },
  });
  const teacherA = await prisma.schoolTeacherProfile.create({
    data: { companyId, userId: userA.id, employeeCode: "T001" },
  });
  teacherAId = teacherA.id;
  const teacherB = await prisma.schoolTeacherProfile.create({
    data: { companyId, userId: userB.id, employeeCode: "T002" },
  });
  teacherBId = teacherB.id;

  const periodOne = await prisma.schoolPeriod.create({
    data: {
      companyId,
      code: "P1",
      name: "Period 1",
      startMinute: 450,
      endMinute: 485,
      sequence: 1,
    },
  });
  periodOneId = periodOne.id;
  const periodTwo = await prisma.schoolPeriod.create({
    data: {
      companyId,
      code: "P2",
      name: "Period 2",
      startMinute: 485,
      endMinute: 520,
      sequence: 2,
    },
  });
  periodTwoId = periodTwo.id;
  const breakPeriod = await prisma.schoolPeriod.create({
    data: {
      companyId,
      code: "BRK",
      name: "Break",
      startMinute: 520,
      endMinute: 540,
      sequence: 3,
      isTeaching: false,
    },
  });
  breakPeriodId = breakPeriod.id;

  const room = await prisma.schoolRoom.create({
    data: { companyId, code: "R1", name: "Room 1" },
  });
  roomId = room.id;
  const otherRoom = await prisma.schoolRoom.create({
    data: { companyId, code: "R2", name: "Room 2" },
  });
  otherRoomId = otherRoom.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.schoolTimetableSlot.deleteMany({ where: { companyId } });
  await prisma.schoolClassSubject.deleteMany({ where: { companyId } });
});

describe("time helpers", () => {
  it("round-trips minutes and clock text", () => {
    expect(formatMinute(450)).toBe("07:30");
    expect(formatMinute(0)).toBe("00:00");
    expect(parseMinute("07:30")).toBe(450);
    expect(parseMinute("7:30")).toBe(450);
    expect(parseMinute("24:00")).toBeNull();
    expect(parseMinute("07:60")).toBeNull();
    expect(parseMinute("half seven")).toBeNull();
  });

  it("rejects a period that ends before it starts", () => {
    expect(isValidPeriodRange(450, 485)).toBe(true);
    expect(isValidPeriodRange(485, 450)).toBe(false);
    expect(isValidPeriodRange(450, 450)).toBe(false);
    expect(isValidPeriodRange(-1, 450)).toBe(false);
  });

  it("treats a shared boundary minute as adjacent, not overlapping", () => {
    // Period 1 ending at 08:05 and period 2 starting at 08:05 is the normal
    // shape of a school day, not a clash.
    expect(periodsOverlap(450, 485, 485, 520)).toBe(false);
    expect(periodsOverlap(450, 486, 485, 520)).toBe(true);
  });
});

describe("period ranges — MIGRATION WITNESS", () => {
  it("refuses a period that ends before it starts", async () => {
    await expect(
      prisma.schoolPeriod.create({
        data: {
          companyId,
          code: "BAD",
          name: "Backwards",
          startMinute: 600,
          endMinute: 500,
          sequence: 9,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a period outside the day", async () => {
    await expect(
      prisma.schoolPeriod.create({
        data: {
          companyId,
          code: "LATE",
          name: "Too late",
          startMinute: 1400,
          endMinute: 1500,
          sequence: 9,
        },
      }),
    ).rejects.toThrow();
  });

  it("finds an overlapping period in the same set", async () => {
    const clash = await findOverlappingPeriod({
      companyId,
      termId: null,
      startMinute: 470,
      endMinute: 500,
    });
    expect(clash?.code).toBe("P1");

    const clear = await findOverlappingPeriod({
      companyId,
      termId: null,
      startMinute: 600,
      endMinute: 640,
    });
    expect(clear).toBeNull();
  });
});

describe("day of week — MIGRATION WITNESS", () => {
  it("refuses a day outside 1-7", async () => {
    const assignment = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });

    await expect(
      prisma.schoolTimetableSlot.create({
        data: {
          companyId,
          termId,
          classSubjectId: assignment.id,
          periodId: periodOneId,
          dayOfWeek: 8,
          classId,
          streamId,
          teacherProfileId: teacherAId,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("clash rules — MIGRATION WITNESS", () => {
  it("refuses the same class twice in one slot at the database level", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const english = await makeAssignment({
      subjectId: subjectBId,
      teacherProfileId: teacherBId,
    });

    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: maths.id,
        periodId: periodOneId,
        dayOfWeek: 1,
        classId,
        streamId,
        teacherProfileId: teacherAId,
      },
    });

    await expect(
      prisma.schoolTimetableSlot.create({
        data: {
          companyId,
          termId,
          classSubjectId: english.id,
          periodId: periodOneId,
          dayOfWeek: 1,
          classId,
          streamId,
          teacherProfileId: teacherBId,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses a class with no stream twice in one slot", async () => {
    // The NULL case is the one a plain unique index would let through, because
    // Postgres treats two NULLs as distinct. This is why the index is partial.
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      streamId: null,
    });
    const english = await makeAssignment({
      subjectId: subjectBId,
      teacherProfileId: teacherBId,
      streamId: null,
    });

    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: maths.id,
        periodId: periodOneId,
        dayOfWeek: 1,
        classId,
        streamId: null,
        teacherProfileId: teacherAId,
      },
    });

    await expect(
      prisma.schoolTimetableSlot.create({
        data: {
          companyId,
          termId,
          classSubjectId: english.id,
          periodId: periodOneId,
          dayOfWeek: 1,
          classId,
          streamId: null,
          teacherProfileId: teacherBId,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses one teacher in two places at once", async () => {
    const otherClass = await prisma.schoolClass.create({
      data: { companyId, code: `F2-${Date.now()}`, name: "Form 2", level: 9 },
    });
    const here = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const there = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      classId: otherClass.id,
      streamId: null,
    });

    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: here.id,
        periodId: periodOneId,
        dayOfWeek: 2,
        classId,
        streamId,
        teacherProfileId: teacherAId,
      },
    });

    await expect(
      prisma.schoolTimetableSlot.create({
        data: {
          companyId,
          termId,
          classSubjectId: there.id,
          periodId: periodOneId,
          dayOfWeek: 2,
          classId: otherClass.id,
          streamId: null,
          teacherProfileId: teacherAId,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses one room hosting two lessons, but allows two unroomed lessons", async () => {
    const otherClass = await prisma.schoolClass.create({
      data: { companyId, code: `F3-${Date.now()}`, name: "Form 3", level: 10 },
    });
    const here = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const there = await makeAssignment({
      subjectId: subjectBId,
      teacherProfileId: teacherBId,
      classId: otherClass.id,
      streamId: null,
    });

    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: here.id,
        periodId: periodOneId,
        dayOfWeek: 3,
        roomId,
        classId,
        streamId,
        teacherProfileId: teacherAId,
      },
    });

    await expect(
      prisma.schoolTimetableSlot.create({
        data: {
          companyId,
          termId,
          classSubjectId: there.id,
          periodId: periodOneId,
          dayOfWeek: 3,
          roomId,
          classId: otherClass.id,
          streamId: null,
          teacherProfileId: teacherBId,
        },
      }),
    ).rejects.toThrow();

    // A school that does not track rooms must not be blocked by the room rule.
    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: there.id,
        periodId: periodOneId,
        dayOfWeek: 3,
        roomId: null,
        classId: otherClass.id,
        streamId: null,
        teacherProfileId: teacherBId,
      },
    });

    const unroomed = await prisma.schoolTimetableSlot.count({
      where: { companyId, termId, dayOfWeek: 3, periodId: periodOneId, roomId: null },
    });
    expect(unroomed).toBe(1);
  });

  it("allows the same lesson in the same period on a different day", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });

    for (const dayOfWeek of [1, 2, 3]) {
      const result = await createTimetableSlot({
        companyId,
        termId,
        classSubjectId: maths.id,
        periodId: periodOneId,
        dayOfWeek,
      });
      expect(result.ok, `day ${dayOfWeek}`).toBe(true);
    }

    const count = await prisma.schoolTimetableSlot.count({ where: { companyId, termId } });
    expect(count).toBe(3);
  });
});

describe("conflict messages", () => {
  it("names the class, the teacher and the room in one answer", async () => {
    const otherClass = await prisma.schoolClass.create({
      data: { companyId, code: `F4-${Date.now()}`, name: "Form 4", level: 11 },
    });
    const sitting = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: sitting.id,
      periodId: periodOneId,
      dayOfWeek: 1,
      roomId,
    });

    // Same class, same teacher, same room — all three rules at once.
    const moving = await makeAssignment({
      subjectId: subjectBId,
      teacherProfileId: teacherAId,
    });
    const conflicts = await findSlotConflicts({
      companyId,
      termId,
      classSubjectId: moving.id,
      periodId: periodOneId,
      dayOfWeek: 1,
      roomId,
    });

    const kinds = conflicts.map((conflict) => conflict.kind);
    expect(kinds).toContain("CLASS");
    expect(kinds).toContain("TEACHER");
    expect(kinds).toContain("ROOM");

    // All of them, not just the first — fixing a clash one refused save at a
    // time is the experience this returns a list to avoid.
    expect(conflicts.length).toBeGreaterThanOrEqual(3);

    const teacherMessage = conflicts.find((c) => c.kind === "TEACHER")!.message;
    expect(teacherMessage).toContain("Ms Banda");
    expect(teacherMessage).toContain("Mathematics");
    expect(teacherMessage).toContain("Period 1");

    expect(otherClass.id).toBeTruthy();
  });

  it("refuses to schedule anything in a non-teaching period", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });

    const result = await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: breakPeriodId,
      dayOfWeek: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && "conflicts" in result) {
      expect(result.conflicts[0].kind).toBe("NON_TEACHING");
      expect(result.conflicts[0].message).toContain("Break");
    }
  });

  it("does not report a slot as clashing with itself when it is being edited", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const created = await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: periodOneId,
      dayOfWeek: 1,
      roomId,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const conflicts = await findSlotConflicts({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: periodOneId,
      dayOfWeek: 1,
      roomId,
      excludeSlotId: created.slotId,
    });
    expect(conflicts).toEqual([]);
  });

  it("does not leak another company's timetable into a clash check", async () => {
    const stamp = Date.now();
    const otherCompany = await prisma.company.create({
      data: { name: `Other Timetable ${stamp}`, slug: `other-timetable-${stamp}` },
    });

    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    // The other company naming our assignment gets no clash and no data — the
    // assignment does not resolve inside its own scope.
    const conflicts = await findSlotConflicts({
      companyId: otherCompany.id,
      termId,
      classSubjectId: maths.id,
      periodId: periodOneId,
      dayOfWeek: 1,
    });
    expect(conflicts).toEqual([]);

    await prisma.company.delete({ where: { id: otherCompany.id } });
  });

  it("rejects an assignment that belongs to another company", async () => {
    const result = await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: "00000000-0000-0000-0000-000000000000",
      periodId: periodOneId,
      dayOfWeek: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect("notFound" in result).toBe(true);
  });
});

describe("derived columns cannot drift", () => {
  it("re-copies the teacher when an assignment changes hands", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const created = await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: periodOneId,
      dayOfWeek: 1,
    });
    expect(created.ok).toBe(true);

    await prisma.schoolClassSubject.update({
      where: { id: maths.id },
      data: { teacherProfileId: teacherBId },
    });

    // Before the sync the slot still protects the wrong teacher.
    const stale = await prisma.schoolTimetableSlot.findFirst({
      where: { companyId, classSubjectId: maths.id },
      select: { teacherProfileId: true },
    });
    expect(stale?.teacherProfileId).toBe(teacherAId);

    const synced = await syncSlotDenormalisation({ companyId, classSubjectId: maths.id });
    expect(synced.updated).toBe(1);
    expect(synced.nowClashing).toEqual([]);

    const fresh = await prisma.schoolTimetableSlot.findFirst({
      where: { companyId, classSubjectId: maths.id },
      select: { teacherProfileId: true },
    });
    expect(fresh?.teacherProfileId).toBe(teacherBId);
  });

  it("reports rather than deletes a slot the new teacher cannot take", async () => {
    const otherClass = await prisma.schoolClass.create({
      data: { companyId, code: `F5-${Date.now()}`, name: "Form 5", level: 12 },
    });
    const mine = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const theirs = await makeAssignment({
      subjectId: subjectBId,
      teacherProfileId: teacherBId,
      classId: otherClass.id,
      streamId: null,
    });

    await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: mine.id,
      periodId: periodOneId,
      dayOfWeek: 1,
    });
    await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: theirs.id,
      periodId: periodOneId,
      dayOfWeek: 1,
    });

    // Hand the first lesson to the teacher who is already busy in that slot.
    await prisma.schoolClassSubject.update({
      where: { id: mine.id },
      data: { teacherProfileId: teacherBId },
    });

    const synced = await syncSlotDenormalisation({ companyId, classSubjectId: mine.id });
    expect(synced.updated).toBe(0);
    expect(synced.nowClashing).toHaveLength(1);

    // The lesson is still on the timetable for the timetabler to resolve.
    const survives = await prisma.schoolTimetableSlot.count({
      where: { companyId, classSubjectId: mine.id },
    });
    expect(survives).toBe(1);
  });
});

describe("copy forward", () => {
  it("copies lessons whose assignment exists in the target term", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const english = await makeAssignment({
      subjectId: subjectBId,
      teacherProfileId: teacherBId,
    });

    await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: periodOneId,
      dayOfWeek: 1,
      roomId,
    });
    await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: english.id,
      periodId: periodTwoId,
      dayOfWeek: 1,
      roomId: otherRoomId,
    });

    // Only maths is taught next term, so only maths can carry over.
    await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      termId: otherTermId,
    });

    const result = await copyTimetableToTerm({
      companyId,
      fromTermId: termId,
      toTermId: otherTermId,
    });

    expect(result.copied).toBe(1);
    expect(result.skippedNoAssignment).toBe(1);
    expect(result.skippedClash).toBe(0);

    const copied = await prisma.schoolTimetableSlot.findMany({
      where: { companyId, termId: otherTermId },
      select: { dayOfWeek: true, periodId: true, roomId: true },
    });
    expect(copied).toHaveLength(1);
    expect(copied[0].dayOfWeek).toBe(1);
    expect(copied[0].periodId).toBe(periodOneId);
    expect(copied[0].roomId).toBe(roomId);
  });

  it("adds to the target term rather than overwriting it, and is safe to re-run", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: periodOneId,
      dayOfWeek: 1,
    });
    await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      termId: otherTermId,
    });

    const first = await copyTimetableToTerm({
      companyId,
      fromTermId: termId,
      toTermId: otherTermId,
    });
    expect(first.copied).toBe(1);

    // A second run finds the lesson already there and reports it as a clash
    // rather than duplicating it.
    const second = await copyTimetableToTerm({
      companyId,
      fromTermId: termId,
      toTermId: otherTermId,
    });
    expect(second.copied).toBe(0);
    expect(second.skippedClash).toBe(1);

    const total = await prisma.schoolTimetableSlot.count({
      where: { companyId, termId: otherTermId },
    });
    expect(total).toBe(1);
  });
});

describe("auto-fill", () => {
  it("places every assignment without breaking a clash rule", async () => {
    const otherClass = await prisma.schoolClass.create({
      data: { companyId, code: `AF-${Date.now()}`, name: "Auto Form", level: 20 },
    });
    await makeAssignment({ subjectId: subjectAId, teacherProfileId: teacherAId });
    await makeAssignment({ subjectId: subjectBId, teacherProfileId: teacherBId });
    await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      classId: otherClass.id,
      streamId: null,
    });

    const result = await autoFillTimetable({ companyId, termId, periodsPerSubject: 2 });

    expect(result.placed).toBe(6);
    expect(result.unplaced).toEqual([]);

    // The rules held. If any had been broken the insert would have thrown, so
    // this asserts the shape a timetabler would check: nobody in two places.
    const slots = await prisma.schoolTimetableSlot.findMany({
      where: { companyId, termId },
      select: { dayOfWeek: true, periodId: true, teacherProfileId: true, classId: true },
    });
    const teacherSlots = new Set(
      slots.map((s) => `${s.dayOfWeek}:${s.periodId}:${s.teacherProfileId}`),
    );
    expect(teacherSlots.size).toBe(slots.length);
    const classSlots = new Set(
      slots.map((s) => `${s.dayOfWeek}:${s.periodId}:${s.classId}`),
    );
    expect(classSlots.size).toBe(slots.length);
  });

  it("adds to a half-built timetable instead of rewriting it", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
    });
    const placedByHand = await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: periodTwoId,
      dayOfWeek: 4,
      roomId,
    });
    expect(placedByHand.ok).toBe(true);
    if (!placedByHand.ok) return;

    await autoFillTimetable({ companyId, termId, periodsPerSubject: 2 });

    // The hand-placed lesson is exactly where it was put, room and all.
    const kept = await prisma.schoolTimetableSlot.findUnique({
      where: { id: placedByHand.slotId },
      select: { dayOfWeek: true, periodId: true, roomId: true },
    });
    expect(kept).toEqual({ dayOfWeek: 4, periodId: periodTwoId, roomId });
  });

  it("reports what it could not place rather than silently under-filling", async () => {
    await makeAssignment({ subjectId: subjectAId, teacherProfileId: teacherAId });

    // Five teaching periods x five days is 25 slots for this class, so asking
    // for 30 cannot be satisfied.
    const result = await autoFillTimetable({ companyId, termId, periodsPerSubject: 30 });

    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0].wanted).toBe(30);
    expect(result.unplaced[0].placed).toBeLessThan(30);
    expect(result.unplaced[0].label).toContain("Mathematics");
  });

  it("never schedules into a non-teaching period", async () => {
    await makeAssignment({ subjectId: subjectAId, teacherProfileId: teacherAId });
    await autoFillTimetable({ companyId, termId, periodsPerSubject: 5 });

    const inBreak = await prisma.schoolTimetableSlot.count({
      where: { companyId, termId, periodId: breakPeriodId },
    });
    expect(inBreak).toBe(0);
  });
});

describe("bulk teacher allocation", () => {
  it("creates the assignments that do not exist and moves the ones that do", async () => {
    const otherClass = await prisma.schoolClass.create({
      data: { companyId, code: `BA-${Date.now()}`, name: "Bulk Form", level: 21 },
    });
    // One already exists, under a different teacher.
    await makeAssignment({ subjectId: subjectAId, teacherProfileId: teacherBId });

    const result = await allocateTeacherToClasses({
      companyId,
      termId,
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      targets: [
        { classId, streamId },
        { classId: otherClass.id, streamId: null },
      ],
    });

    expect(result.reassigned).toBe(1);
    expect(result.created).toBe(1);
    expect(result.unchanged).toBe(0);

    const rows = await prisma.schoolClassSubject.findMany({
      where: { companyId, termId, subjectId: subjectAId },
      select: { teacherProfileId: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.teacherProfileId === teacherAId)).toBe(true);
  });

  it("is idempotent", async () => {
    await allocateTeacherToClasses({
      companyId,
      termId,
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      targets: [{ classId, streamId }],
    });
    const again = await allocateTeacherToClasses({
      companyId,
      termId,
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      targets: [{ classId, streamId }],
    });

    expect(again.unchanged).toBe(1);
    expect(again.created).toBe(0);
    expect(again.reassigned).toBe(0);
  });

  it("re-points the timetable slots a reassigned lesson already had", async () => {
    const maths = await makeAssignment({
      subjectId: subjectAId,
      teacherProfileId: teacherBId,
    });
    await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: maths.id,
      periodId: periodOneId,
      dayOfWeek: 5,
    });

    await allocateTeacherToClasses({
      companyId,
      termId,
      subjectId: subjectAId,
      teacherProfileId: teacherAId,
      targets: [{ classId, streamId }],
    });

    // The slot follows the assignment, or the teacher-clash index would be
    // protecting somebody who no longer teaches the lesson.
    const slot = await prisma.schoolTimetableSlot.findFirst({
      where: { companyId, classSubjectId: maths.id },
      select: { teacherProfileId: true },
    });
    expect(slot?.teacherProfileId).toBe(teacherAId);
  });
});
