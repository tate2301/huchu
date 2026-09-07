import { prisma } from "@corelithzw/db/client";

/**
 * Lesson plans, cover, and the resources a teacher reaches for.
 *
 * A plan hangs off a *lesson on a date*, not off the timetable slot alone: a
 * slot is every Tuesday and a plan is for one of them. Cover follows the plan
 * for the same reason — arranging cover against a slot would hand the class
 * over permanently rather than for the morning somebody is ill.
 */

export class LessonPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonPlanError";
  }
}

/** Midnight UTC for a date, so a plan for Tuesday is one row however it arrives. */
function asDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export async function saveLessonPlan(input: {
  companyId: string;
  id?: string;
  termId: string;
  classSubjectId: string;
  slotId?: string | null;
  lessonDate: Date;
  topic: string;
  objectives?: string | null;
  activities?: string | null;
  resourcesNote?: string | null;
  homeworkNote?: string | null;
  reflection?: string | null;
  createdById?: string | null;
}) {
  const assignment = await prisma.schoolClassSubject.findFirst({
    where: { id: input.classSubjectId, companyId: input.companyId },
    select: { id: true, termId: true },
  });
  if (!assignment) throw new LessonPlanError("Class subject not found");

  const data = {
    termId: input.termId,
    classSubjectId: assignment.id,
    slotId: input.slotId ?? null,
    lessonDate: asDay(input.lessonDate),
    topic: input.topic,
    objectives: input.objectives ?? null,
    activities: input.activities ?? null,
    resourcesNote: input.resourcesNote ?? null,
    homeworkNote: input.homeworkNote ?? null,
    reflection: input.reflection ?? null,
  };

  try {
    if (input.id) {
      const existing = await prisma.schoolLessonPlan.findFirst({
        where: { id: input.id, companyId: input.companyId },
        select: { id: true },
      });
      if (!existing) throw new LessonPlanError("Lesson plan not found");
      return await prisma.schoolLessonPlan.update({
        where: { id: existing.id },
        data,
        select: { id: true, lessonDate: true, topic: true },
      });
    }

    return await prisma.schoolLessonPlan.create({
      data: {
        companyId: input.companyId,
        createdById: input.createdById ?? null,
        ...data,
      },
      select: { id: true, lessonDate: true, topic: true },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new LessonPlanError(
        "There is already a plan for that lesson. Open it rather than writing a second one.",
      );
    }
    throw error;
  }
}

/**
 * Copy a week's plans forward.
 *
 * The thing that makes lesson planning survivable: most of next week is last
 * week's shape with different topics, and retyping the objectives is what stops
 * teachers doing it at all.
 *
 * Skips a lesson that already has a plan rather than overwriting it — a teacher
 * who has started next week should not lose that work to a copy-forward — and
 * reports what it skipped.
 */
export async function copyWeekForward(input: {
  companyId: string;
  classSubjectId: string;
  fromWeekStart: Date;
  toWeekStart: Date;
  createdById?: string | null;
}) {
  const from = asDay(input.fromWeekStart);
  const to = asDay(input.toWeekStart);
  const week = 7 * 24 * 60 * 60 * 1000;
  const offset = to.getTime() - from.getTime();

  if (offset === 0) {
    throw new LessonPlanError("Pick a different week to copy into");
  }

  const source = await prisma.schoolLessonPlan.findMany({
    where: {
      companyId: input.companyId,
      classSubjectId: input.classSubjectId,
      lessonDate: { gte: from, lt: new Date(from.getTime() + week) },
    },
    orderBy: { lessonDate: "asc" },
  });

  if (source.length === 0) {
    return { copied: 0, skipped: 0, message: "That week has no plans to copy" };
  }

  const targets = source.map((plan) => ({
    plan,
    lessonDate: new Date(plan.lessonDate.getTime() + offset),
  }));

  const existing = await prisma.schoolLessonPlan.findMany({
    where: {
      companyId: input.companyId,
      classSubjectId: input.classSubjectId,
      lessonDate: { in: targets.map((target) => target.lessonDate) },
    },
    select: { lessonDate: true, slotId: true },
  });
  const taken = new Set(
    existing.map((row) => `${row.slotId ?? ""}|${row.lessonDate.toISOString()}`),
  );

  const toWrite = targets.filter(
    (target) =>
      !taken.has(`${target.plan.slotId ?? ""}|${target.lessonDate.toISOString()}`),
  );

  if (toWrite.length > 0) {
    await prisma.schoolLessonPlan.createMany({
      data: toWrite.map((target) => ({
        companyId: input.companyId,
        termId: target.plan.termId,
        classSubjectId: target.plan.classSubjectId,
        slotId: target.plan.slotId,
        lessonDate: target.lessonDate,
        topic: target.plan.topic,
        objectives: target.plan.objectives,
        activities: target.plan.activities,
        resourcesNote: target.plan.resourcesNote,
        homeworkNote: target.plan.homeworkNote,
        // The reflection is deliberately not copied: it is what happened last
        // week, and carrying it forward would put a note about a lesson that
        // has not been taught onto next Tuesday.
        reflection: null,
        createdById: input.createdById ?? null,
      })),
    });
  }

  return {
    copied: toWrite.length,
    skipped: targets.length - toWrite.length,
    message:
      targets.length - toWrite.length > 0
        ? `${targets.length - toWrite.length} lesson${targets.length - toWrite.length === 1 ? "" : "s"} already had a plan and were left alone`
        : null,
  };
}

/**
 * Lay a week's plans out from the timetable.
 *
 * The other half of "copy last week forward". Copying needs a written week to
 * copy, and the first week of term is exactly when there is not one — so the
 * timetable itself becomes the source: one draft plan per lesson the class is
 * actually going to have, dated and tied to its slot, with the topic carried
 * forward from the last thing that was taught. The teacher renames the topic
 * and fills the boxes; the part that made planning feel like data entry — the
 * dates, the slots, one row per lesson — is already done.
 *
 * A lesson that already has a plan is left alone, same as copy-forward: this
 * fills gaps, it never overwrites work. Dates outside the term are skipped,
 * because a slot pattern knows nothing about half-term ending on Wednesday.
 *
 * Where a scheme of work exists for this subject, level and term, the week's
 * row in it wins: the drafts take that week's topic, objectives, activities
 * and resources, and the planner opens already saying what the syllabus says
 * should be taught. Without one, the topic falls back to continuing whatever
 * was taught last.
 */
export async function layOutWeek(input: {
  companyId: string;
  classSubjectId: string;
  weekStart: Date;
  createdById?: string | null;
}): Promise<{
  created: number;
  skipped: number;
  /** The topic the drafts were seeded from, if anything seeded them. */
  seededFrom: string | null;
  /** True when the seed came from the scheme of work rather than continuation. */
  fromScheme: boolean;
  message: string | null;
}> {
  const day = asDay(input.weekStart);
  // Normalise to the Monday, so "lay out this week" from a Wednesday still
  // lays out the whole week.
  const isoDow = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
  const monday = new Date(day.getTime() - (isoDow - 1) * 86_400_000);
  const week = 7 * 24 * 60 * 60 * 1000;

  const assignment = await prisma.schoolClassSubject.findFirst({
    where: { id: input.classSubjectId, companyId: input.companyId },
    select: {
      id: true,
      termId: true,
      subjectId: true,
      class: { select: { level: true } },
      term: { select: { startDate: true, endDate: true } },
    },
  });
  if (!assignment) throw new LessonPlanError("Class subject not found");

  // Which week of the term this is, counted Monday to Monday from the term's
  // first week — the row a scheme of work would file this week under.
  const termStartDay = asDay(assignment.term.startDate);
  const termStartDow = termStartDay.getUTCDay() === 0 ? 7 : termStartDay.getUTCDay();
  const termFirstMonday = new Date(
    termStartDay.getTime() - (termStartDow - 1) * 86_400_000,
  );
  const weekOfTerm =
    Math.floor((monday.getTime() - termFirstMonday.getTime()) / (7 * 86_400_000)) + 1;

  // A class with no declared level cannot be matched to a scheme, which is
  // filed per form; such a class simply falls back to continuation.
  const scheme =
    weekOfTerm >= 1 && assignment.class.level != null
      ? await prisma.schoolSchemeOfWork.findUnique({
          where: {
            companyId_subjectId_termId_level_weekOfTerm: {
              companyId: input.companyId,
              subjectId: assignment.subjectId,
              termId: assignment.termId,
              level: assignment.class.level,
              weekOfTerm,
            },
          },
        })
      : null;

  const [slots, existing, previous] = await Promise.all([
    prisma.schoolTimetableSlot.findMany({
      where: { companyId: input.companyId, classSubjectId: assignment.id },
      select: {
        id: true,
        dayOfWeek: true,
        period: { select: { sequence: true, startMinute: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { period: { sequence: "asc" } }],
    }),
    prisma.schoolLessonPlan.findMany({
      where: {
        companyId: input.companyId,
        classSubjectId: assignment.id,
        lessonDate: { gte: monday, lt: new Date(monday.getTime() + week) },
      },
      select: { lessonDate: true, slotId: true },
    }),
    prisma.schoolLessonPlan.findFirst({
      where: {
        companyId: input.companyId,
        classSubjectId: assignment.id,
        lessonDate: { lt: monday },
      },
      orderBy: { lessonDate: "desc" },
      select: { topic: true },
    }),
  ]);

  if (slots.length === 0) {
    return {
      created: 0,
      skipped: 0,
      seededFrom: null,
      fromScheme: false,
      message: "This class has no lessons on the timetable yet",
    };
  }

  const taken = new Set(
    existing.map((row) => `${row.slotId ?? ""}|${row.lessonDate.toISOString()}`),
  );

  const termStart = termStartDay;
  const termEnd = asDay(assignment.term.endDate);

  // The scheme's row for this week wins; failing that, continuation rather
  // than repetition — the drafts pick up where teaching left off.
  const seededFrom = scheme?.topic ?? previous?.topic ?? null;
  const fromScheme = Boolean(scheme);
  const topic = scheme
    ? scheme.topic
    : previous
      ? `${previous.topic} — continued`
      : "New topic";

  const toWrite = slots
    .map((slot) => ({
      slot,
      lessonDate: new Date(monday.getTime() + (slot.dayOfWeek - 1) * 86_400_000),
    }))
    .filter(
      ({ slot, lessonDate }) =>
        lessonDate >= termStart &&
        lessonDate <= termEnd &&
        !taken.has(`${slot.id}|${lessonDate.toISOString()}`),
    );

  if (toWrite.length > 0) {
    await prisma.schoolLessonPlan.createMany({
      data: toWrite.map(({ slot, lessonDate }) => ({
        companyId: input.companyId,
        termId: assignment.termId,
        classSubjectId: assignment.id,
        slotId: slot.id,
        lessonDate,
        topic,
        objectives: scheme?.objectives ?? null,
        activities: scheme?.activities ?? null,
        resourcesNote: scheme?.resourcesNote ?? null,
        createdById: input.createdById ?? null,
      })),
    });
  }

  const skipped = slots.length - toWrite.length;
  return {
    created: toWrite.length,
    skipped,
    seededFrom,
    fromScheme,
    message:
      toWrite.length === 0
        ? "Every lesson this week is already planned"
        : null,
  };
}

/**
 * Arrange cover for one lesson.
 *
 * Refused when the covering teacher is teaching something else at the same
 * time — which is the whole point, and only answerable because the plan knows
 * its slot. A cover arranged into a clash is one nobody discovers until two
 * classes are waiting.
 */
export async function arrangeCover(input: {
  companyId: string;
  lessonPlanId: string;
  coveringTeacherProfileId: string;
  reason?: string | null;
  arrangedById?: string | null;
}) {
  const plan = await prisma.schoolLessonPlan.findFirst({
    where: { id: input.lessonPlanId, companyId: input.companyId },
    select: {
      id: true,
      lessonDate: true,
      slotId: true,
      slot: { select: { id: true, dayOfWeek: true, periodId: true } },
      classSubject: { select: { teacherProfileId: true } },
    },
  });
  if (!plan) throw new LessonPlanError("Lesson plan not found");

  if (plan.classSubject.teacherProfileId === input.coveringTeacherProfileId) {
    throw new LessonPlanError("That is the teacher who normally takes this lesson");
  }

  if (plan.slot) {
    const clash = await prisma.schoolTimetableSlot.findFirst({
      where: {
        companyId: input.companyId,
        dayOfWeek: plan.slot.dayOfWeek,
        periodId: plan.slot.periodId,
        teacherProfileId: input.coveringTeacherProfileId,
      },
      select: {
        classSubject: {
          select: {
            subject: { select: { name: true } },
            class: { select: { name: true } },
          },
        },
      },
    });
    if (clash) {
      throw new LessonPlanError(
        `They are teaching ${clash.classSubject.subject.name} to ${clash.classSubject.class.name} at that time`,
      );
    }
  }

  return prisma.schoolCoverAssignment.upsert({
    where: { lessonPlanId: plan.id },
    create: {
      companyId: input.companyId,
      lessonPlanId: plan.id,
      coveringTeacherProfileId: input.coveringTeacherProfileId,
      reason: input.reason ?? null,
      arrangedById: input.arrangedById ?? null,
    },
    update: {
      coveringTeacherProfileId: input.coveringTeacherProfileId,
      reason: input.reason ?? null,
      arrangedById: input.arrangedById ?? null,
    },
    select: { id: true, coveringTeacherProfileId: true },
  });
}

/** A week of lessons for one assignment, plans and cover together. */
export async function lessonWeek(input: {
  companyId: string;
  classSubjectId?: string;
  teacherProfileId?: string;
  weekStart: Date;
}) {
  const from = asDay(input.weekStart);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

  return prisma.schoolLessonPlan.findMany({
    where: {
      companyId: input.companyId,
      lessonDate: { gte: from, lt: to },
      ...(input.classSubjectId ? { classSubjectId: input.classSubjectId } : {}),
      ...(input.teacherProfileId
        ? { classSubject: { teacherProfileId: input.teacherProfileId } }
        : {}),
    },
    select: {
      id: true,
      lessonDate: true,
      topic: true,
      objectives: true,
      activities: true,
      homeworkNote: true,
      reflection: true,
      slot: {
        select: {
          id: true,
          dayOfWeek: true,
          period: { select: { code: true, name: true, startMinute: true } },
        },
      },
      classSubject: {
        select: {
          id: true,
          subject: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
          stream: { select: { id: true, name: true } },
        },
      },
      cover: {
        select: {
          id: true,
          reason: true,
          coveringTeacher: {
            select: { id: true, user: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ lessonDate: "asc" }, { slot: { period: { startMinute: "asc" } } }],
  });
}
