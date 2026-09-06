/**
 * Lesson plans, cover and copy-forward.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  arrangeCover,
  copyWeekForward,
  layOutWeek,
  lessonWeek,
  saveLessonPlan,
} from "./lesson-plans";

let companyId: string;
let termId: string;
let classId: string;
let mathsSubjectId: string;
let mathsAssignmentId: string;
let englishAssignmentId: string;
let teacherAId: string;
let teacherBId: string;
let mathsSlotId: string;
let englishSlotId: string;
let periodOneId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Lesson Test ${stamp}`, slug: `lesson-test-${stamp}` },
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
      isActive: true,
    },
  });
  termId = term.id;

  classId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F1", name: "Form 1", level: 1 },
    })
  ).id;
  const maths = await prisma.schoolSubject.create({
    data: { companyId, code: "MAT", name: "Mathematics" },
  });
  mathsSubjectId = maths.id;
  const english = await prisma.schoolSubject.create({
    data: { companyId, code: "ENG", name: "English" },
  });

  const makeTeacher = async (suffix: string, code: string) => {
    const user = await prisma.user.create({
      data: {
        companyId,
        email: `lesson-${suffix}-${stamp}@test.test`,
        name: `Teacher ${suffix}`,
        role: "TEACHER",
      },
    });
    const profile = await prisma.schoolTeacherProfile.create({
      data: { companyId, userId: user.id, employeeCode: code },
    });
    return profile.id;
  };
  teacherAId = await makeTeacher("a", "T001");
  teacherBId = await makeTeacher("b", "T002");

  mathsAssignmentId = (
    await prisma.schoolClassSubject.create({
      data: {
        companyId,
        termId,
        classId,
        subjectId: maths.id,
        teacherProfileId: teacherAId,
      },
    })
  ).id;
  englishAssignmentId = (
    await prisma.schoolClassSubject.create({
      data: {
        companyId,
        termId,
        classId,
        subjectId: english.id,
        teacherProfileId: teacherBId,
      },
    })
  ).id;

  periodOneId = (
    await prisma.schoolPeriod.create({
      data: {
        companyId,
        code: "P1",
        name: "Period 1",
        startMinute: 450,
        endMinute: 485,
        sequence: 1,
      },
    })
  ).id;

  mathsSlotId = (
    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: mathsAssignmentId,
        periodId: periodOneId,
        dayOfWeek: 2,
        classId,
        teacherProfileId: teacherAId,
      },
    })
  ).id;
  englishSlotId = (
    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: englishAssignmentId,
        periodId: periodOneId,
        dayOfWeek: 3,
        classId,
        teacherProfileId: teacherBId,
      },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.schoolCoverAssignment.deleteMany({ where: { companyId } });
  await prisma.schoolLessonPlan.deleteMany({ where: { companyId } });
  await prisma.schoolSchemeOfWork.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("saveLessonPlan", () => {
  it("writes a plan against a lesson on a date", async () => {
    const plan = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "Simultaneous equations",
      objectives: "Solve a pair by substitution",
    });
    expect(plan.topic).toBe("Simultaneous equations");
  });

  it("refuses a second plan for the same lesson — MIGRATION WITNESS", async () => {
    const data = {
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "First",
    };
    await saveLessonPlan(data);
    await expect(saveLessonPlan({ ...data, topic: "Second" })).rejects.toThrow(
      /already a plan/,
    );
  });

  it("allows two plans with no slot on the same day", async () => {
    // A teacher plans a topic before the timetable is built. Those must not
    // collide, which is why the index is partial.
    const base = {
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      lessonDate: date("2026-03-03"),
    };
    await saveLessonPlan({ ...base, topic: "Topic one" });
    await saveLessonPlan({ ...base, topic: "Topic two" });
    expect(
      await prisma.schoolLessonPlan.count({ where: { companyId } }),
    ).toBe(2);
  });

  it("edits in place rather than adding a second plan", async () => {
    const first = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "Draft",
    });
    const edited = await saveLessonPlan({
      companyId,
      id: first.id,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "Finished",
    });
    expect(edited.id).toBe(first.id);
    expect(edited.topic).toBe("Finished");
  });
});

describe("copyWeekForward", () => {
  it("copies a week's shape onto the next one", async () => {
    for (const [day, topic] of [
      ["2026-03-03", "Substitution"],
      ["2026-03-05", "Elimination"],
    ] as const) {
      await saveLessonPlan({
        companyId,
        termId,
        classSubjectId: mathsAssignmentId,
        lessonDate: date(day),
        topic,
      });
    }

    const result = await copyWeekForward({
      companyId,
      classSubjectId: mathsAssignmentId,
      fromWeekStart: date("2026-03-02"),
      toWeekStart: date("2026-03-09"),
    });
    expect(result.copied).toBe(2);

    const next = await prisma.schoolLessonPlan.findMany({
      where: { companyId, lessonDate: { gte: date("2026-03-09") } },
      orderBy: { lessonDate: "asc" },
    });
    expect(next.map((plan) => plan.lessonDate)).toEqual([
      date("2026-03-10"),
      date("2026-03-12"),
    ]);
  });

  it("leaves alone a lesson somebody has already planned", async () => {
    // A teacher who has started next week should not lose that work.
    await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "This week",
    });
    await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-10"),
      topic: "Already written",
    });

    const result = await copyWeekForward({
      companyId,
      classSubjectId: mathsAssignmentId,
      fromWeekStart: date("2026-03-02"),
      toWeekStart: date("2026-03-09"),
    });
    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);

    const kept = await prisma.schoolLessonPlan.findFirstOrThrow({
      where: { companyId, lessonDate: date("2026-03-10") },
    });
    expect(kept.topic).toBe("Already written");
  });

  it("does not carry a reflection forward", async () => {
    // What happened last week is not a note about a lesson that has not been
    // taught.
    await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      lessonDate: date("2026-03-03"),
      topic: "Substitution",
      reflection: "Ran out of time on the last two questions",
    });
    await copyWeekForward({
      companyId,
      classSubjectId: mathsAssignmentId,
      fromWeekStart: date("2026-03-02"),
      toWeekStart: date("2026-03-09"),
    });
    const copied = await prisma.schoolLessonPlan.findFirstOrThrow({
      where: { companyId, lessonDate: date("2026-03-10") },
    });
    expect(copied.reflection).toBeNull();
    expect(copied.topic).toBe("Substitution");
  });

  it("says so when there is nothing to copy", async () => {
    const result = await copyWeekForward({
      companyId,
      classSubjectId: mathsAssignmentId,
      fromWeekStart: date("2026-03-02"),
      toWeekStart: date("2026-03-09"),
    });
    expect(result.copied).toBe(0);
    expect(result.message).toContain("no plans to copy");
  });

  it("refuses to copy a week onto itself", async () => {
    await expect(
      copyWeekForward({
        companyId,
        classSubjectId: mathsAssignmentId,
        fromWeekStart: date("2026-03-02"),
        toWeekStart: date("2026-03-02"),
      }),
    ).rejects.toThrow(/different week/);
  });
});

describe("layOutWeek", () => {
  it("drafts one plan per timetabled lesson, tied to its slot", async () => {
    // Maths is timetabled once, Tuesday period 1. Laying out the week of
    // 2 March writes exactly one draft, on Tuesday the 3rd, against that slot.
    const result = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    expect(result.created).toBe(1);

    const drafts = await prisma.schoolLessonPlan.findMany({
      where: { companyId, classSubjectId: mathsAssignmentId },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].lessonDate).toEqual(date("2026-03-03"));
    expect(drafts[0].slotId).toBe(mathsSlotId);
  });

  it("picks the topic up from the last thing that was taught", async () => {
    await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-02-24"),
      topic: "Fractions",
    });

    const result = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    expect(result.seededFrom).toBe("Fractions");

    const draft = await prisma.schoolLessonPlan.findFirst({
      where: { companyId, classSubjectId: mathsAssignmentId, lessonDate: date("2026-03-03") },
    });
    expect(draft?.topic).toBe("Fractions — continued");
  });

  it("leaves alone a lesson somebody has already planned", async () => {
    await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "Already written",
    });

    const result = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.message).toMatch(/already planned/);

    const plan = await prisma.schoolLessonPlan.findFirst({
      where: { companyId, classSubjectId: mathsAssignmentId, lessonDate: date("2026-03-03") },
    });
    expect(plan?.topic).toBe("Already written");
  });

  it("normalises to the Monday, so a Wednesday lays out the same week", async () => {
    const result = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-04"),
    });
    expect(result.created).toBe(1);
    const draft = await prisma.schoolLessonPlan.findFirst({
      where: { companyId, classSubjectId: mathsAssignmentId },
    });
    expect(draft?.lessonDate).toEqual(date("2026-03-03"));
  });

  it("skips a date the term does not reach", async () => {
    // The term ends Friday 10 April 2026. The week of 6 April holds a Tuesday
    // inside the term; a week later there is nothing left to plan.
    const inside = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-04-06"),
    });
    expect(inside.created).toBe(1);

    const after = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-04-13"),
    });
    expect(after.created).toBe(0);
  });

  it("drafts from the scheme of work when the week has a row in it", async () => {
    // The term starts Thursday 8 January, so its first Monday is the 5th and
    // the week of 2 March is week 9 of the term.
    await prisma.schoolSchemeOfWork.create({
      data: {
        companyId,
        subjectId: mathsSubjectId,
        termId,
        level: 1,
        weekOfTerm: 9,
        topic: "Simultaneous equations",
        objectives: "Solve two linear equations by elimination",
        resourcesNote: "Textbook ch. 7",
      },
    });

    const result = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    expect(result.created).toBe(1);
    expect(result.fromScheme).toBe(true);
    expect(result.seededFrom).toBe("Simultaneous equations");

    const draft = await prisma.schoolLessonPlan.findFirst({
      where: { companyId, classSubjectId: mathsAssignmentId },
    });
    expect(draft?.topic).toBe("Simultaneous equations");
    expect(draft?.objectives).toBe("Solve two linear equations by elimination");
    expect(draft?.resourcesNote).toBe("Textbook ch. 7");
  });

  it("lets the scheme beat continuation when both could answer", async () => {
    await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-02-24"),
      topic: "Fractions",
    });
    await prisma.schoolSchemeOfWork.create({
      data: {
        companyId,
        subjectId: mathsSubjectId,
        termId,
        level: 1,
        weekOfTerm: 9,
        topic: "Simultaneous equations",
      },
    });

    const result = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    // The syllabus says what week 9 teaches; "Fractions — continued" is the
    // fallback for a school that has not written one, not a competitor.
    expect(result.fromScheme).toBe(true);
    const draft = await prisma.schoolLessonPlan.findFirst({
      where: { companyId, classSubjectId: mathsAssignmentId, lessonDate: date("2026-03-03") },
    });
    expect(draft?.topic).toBe("Simultaneous equations");
  });

  it("ignores another form's scheme for the same subject and week", async () => {
    await prisma.schoolSchemeOfWork.create({
      data: {
        companyId,
        subjectId: mathsSubjectId,
        termId,
        level: 4,
        weekOfTerm: 9,
        topic: "Quadratic functions",
      },
    });

    const result = await layOutWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    // Form 1's maths must not open on Form 4's topic.
    expect(result.fromScheme).toBe(false);
    const draft = await prisma.schoolLessonPlan.findFirst({
      where: { companyId, classSubjectId: mathsAssignmentId },
    });
    expect(draft?.topic).toBe("New topic");
  });

  it("says so for a class with nothing on the timetable", async () => {
    const geography = await prisma.schoolSubject.create({
      data: { companyId, code: `GEO${Date.now() % 100000}`, name: "Geography" },
    });
    const bare = await prisma.schoolClassSubject.create({
      data: {
        companyId,
        termId,
        classId,
        subjectId: geography.id,
        teacherProfileId: teacherAId,
      },
    });

    const result = await layOutWeek({
      companyId,
      classSubjectId: bare.id,
      weekStart: date("2026-03-02"),
    });
    expect(result.created).toBe(0);
    expect(result.message).toMatch(/no lessons on the timetable/);

    await prisma.schoolClassSubject.delete({ where: { id: bare.id } });
  });
});

describe("arrangeCover", () => {
  it("names a stand-in for one lesson", async () => {
    const plan = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "Substitution",
    });
    const cover = await arrangeCover({
      companyId,
      lessonPlanId: plan.id,
      coveringTeacherProfileId: teacherBId,
      reason: "Ms Banda at a funeral",
    });
    expect(cover.coveringTeacherProfileId).toBe(teacherBId);
  });

  it("refuses a teacher who is teaching something else at that time", async () => {
    // The whole point, and only answerable because the plan knows its slot. A
    // cover arranged into a clash is one nobody finds until two classes wait.
    const plan = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: englishAssignmentId,
      slotId: englishSlotId,
      lessonDate: date("2026-03-04"),
      topic: "Comprehension",
    });
    // Teacher A takes maths somewhere else in that period on Wednesday. It has
    // to be a *different* class: Form 1 already has English then, and the
    // class-clash index would refuse the slot before the cover check saw it.
    const otherClass = await prisma.schoolClass.create({
      data: { companyId, code: `F2-${Date.now()}`, name: "Form 2", level: 2 },
    });
    const otherAssignment = await prisma.schoolClassSubject.create({
      data: {
        companyId,
        termId,
        classId: otherClass.id,
        subjectId: (
          await prisma.schoolClassSubject.findUniqueOrThrow({
            where: { id: mathsAssignmentId },
            select: { subjectId: true },
          })
        ).subjectId,
        teacherProfileId: teacherAId,
      },
    });
    await prisma.schoolTimetableSlot.create({
      data: {
        companyId,
        termId,
        classSubjectId: otherAssignment.id,
        periodId: periodOneId,
        dayOfWeek: 3,
        classId: otherClass.id,
        teacherProfileId: teacherAId,
      },
    });

    await expect(
      arrangeCover({
        companyId,
        lessonPlanId: plan.id,
        coveringTeacherProfileId: teacherAId,
      }),
    ).rejects.toThrow(/teaching Mathematics/);
  });

  it("refuses the teacher who normally takes the lesson", async () => {
    const plan = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "Substitution",
    });
    await expect(
      arrangeCover({
        companyId,
        lessonPlanId: plan.id,
        coveringTeacherProfileId: teacherAId,
      }),
    ).rejects.toThrow(/normally takes/);
  });

  it("replaces rather than doubling when cover is rearranged", async () => {
    const plan = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      lessonDate: date("2026-03-03"),
      topic: "Substitution",
    });
    await arrangeCover({
      companyId,
      lessonPlanId: plan.id,
      coveringTeacherProfileId: teacherBId,
    });
    await arrangeCover({
      companyId,
      lessonPlanId: plan.id,
      coveringTeacherProfileId: teacherBId,
      reason: "Changed reason",
    });
    expect(
      await prisma.schoolCoverAssignment.count({ where: { lessonPlanId: plan.id } }),
    ).toBe(1);
  });

  it("refuses two cover rows for one lesson — MIGRATION WITNESS", async () => {
    const plan = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      lessonDate: date("2026-03-03"),
      topic: "Substitution",
    });
    await prisma.schoolCoverAssignment.create({
      data: {
        companyId,
        lessonPlanId: plan.id,
        coveringTeacherProfileId: teacherBId,
      },
    });
    await expect(
      prisma.schoolCoverAssignment.create({
        data: {
          companyId,
          lessonPlanId: plan.id,
          coveringTeacherProfileId: teacherBId,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("lessonWeek", () => {
  it("returns the week with its cover attached", async () => {
    const plan = await saveLessonPlan({
      companyId,
      termId,
      classSubjectId: mathsAssignmentId,
      slotId: mathsSlotId,
      lessonDate: date("2026-03-03"),
      topic: "Substitution",
    });
    await arrangeCover({
      companyId,
      lessonPlanId: plan.id,
      coveringTeacherProfileId: teacherBId,
    });

    const week = await lessonWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    expect(week).toHaveLength(1);
    expect(week[0].cover?.coveringTeacher.id).toBe(teacherBId);
  });

  it("leaves out the week either side", async () => {
    for (const day of ["2026-02-27", "2026-03-03", "2026-03-10"]) {
      await saveLessonPlan({
        companyId,
        termId,
        classSubjectId: mathsAssignmentId,
        lessonDate: date(day),
        topic: day,
      });
    }
    const week = await lessonWeek({
      companyId,
      classSubjectId: mathsAssignmentId,
      weekStart: date("2026-03-02"),
    });
    expect(week).toHaveLength(1);
  });
});

describe("teaching resources", () => {
  it("refuses a resource that is neither a file nor a link — MIGRATION WITNESS", async () => {
    // A title with nothing behind it, and a shelf full of those is worse than
    // an empty one.
    await expect(
      prisma.schoolTeachingResource.create({
        data: { companyId, title: "Nothing here" },
      }),
    ).rejects.toThrow();
  });

  it("accepts a link-only resource", async () => {
    const resource = await prisma.schoolTeachingResource.create({
      data: {
        companyId,
        title: "Past papers, ZIMSEC 2024",
        linkUrl: "https://example.test/papers",
      },
    });
    expect(resource.fileUrl).toBeNull();
  });
});
