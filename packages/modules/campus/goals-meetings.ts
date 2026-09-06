import { prisma } from "@corelithzw/db/client";

/**
 * Student goals and parent meetings.
 *
 * Two small things a school does that nothing else in the pack covers: what a
 * child is aiming for, and the ten minutes a parent gets to hear about it.
 */

export class GoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalError";
  }
}

export class MeetingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingError";
  }
}

/**
 * Set or change a goal.
 *
 * One per subject per term, upserted — a child revising their target is
 * changing the same goal, not setting a second one, and two goals for one
 * subject leave a progress screen picking between them.
 *
 * The baseline is stamped from the child's current term mark when the goal is
 * first set. Without it "aiming for 70" says nothing about whether that is
 * ambitious or already achieved.
 */
export async function saveGoal(input: {
  companyId: string;
  studentId: string;
  termId: string;
  subjectId: string;
  targetMark?: number | null;
  plan?: string | null;
  teacherNote?: string | null;
  baselineMark?: number | null;
}) {
  if (input.targetMark != null && (input.targetMark < 0 || input.targetMark > 100)) {
    throw new GoalError("A target is a percentage between 0 and 100");
  }

  const existing = await prisma.schoolStudentGoal.findFirst({
    where: {
      companyId: input.companyId,
      studentId: input.studentId,
      termId: input.termId,
      subjectId: input.subjectId,
    },
    select: { id: true, baselineMark: true },
  });

  const data = {
    targetMark: input.targetMark ?? null,
    plan: input.plan ?? null,
    ...(input.teacherNote !== undefined ? { teacherNote: input.teacherNote } : {}),
  };

  if (existing) {
    return prisma.schoolStudentGoal.update({
      where: { id: existing.id },
      data,
      select: { id: true, targetMark: true, baselineMark: true },
    });
  }

  return prisma.schoolStudentGoal.create({
    data: {
      companyId: input.companyId,
      studentId: input.studentId,
      termId: input.termId,
      subjectId: input.subjectId,
      baselineMark: input.baselineMark ?? null,
      ...data,
    },
    select: { id: true, targetMark: true, baselineMark: true },
  });
}

/** A child's goals for a term, with where they actually are. */
export async function goalsForStudent(input: {
  companyId: string;
  studentId: string;
  termId: string;
}) {
  const [goals, lines] = await Promise.all([
    prisma.schoolStudentGoal.findMany({
      where: {
        companyId: input.companyId,
        studentId: input.studentId,
        termId: input.termId,
      },
      select: {
        id: true,
        targetMark: true,
        baselineMark: true,
        plan: true,
        teacherNote: true,
        achievedAt: true,
        subject: { select: { id: true, code: true, name: true } },
      },
      orderBy: { subject: { name: "asc" } },
    }),
    prisma.schoolResultLine.findMany({
      where: {
        companyId: input.companyId,
        studentId: input.studentId,
        sheet: { termId: input.termId },
      },
      select: { subjectCode: true, score: true },
    }),
  ]);

  const currentBySubject = new Map(lines.map((line) => [line.subjectCode, line.score]));

  return goals.map((goal) => {
    const target = goal.targetMark === null ? null : Number(goal.targetMark);
    const current = currentBySubject.get(goal.subject.code) ?? null;
    return {
      ...goal,
      targetMark: target,
      baselineMark: goal.baselineMark === null ? null : Number(goal.baselineMark),
      currentMark: current,
      // Null when either side is missing: "on track" against no mark is a claim
      // nothing supports.
      onTrack: target === null || current === null ? null : current >= target,
    };
  });
}

/** One line on the office's goals screen — a target, or the absence of one. */
export type GoalOversightRow = {
  studentId: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  classId: string | null;
  className: string | null;
  streamName: string | null;
  /** Null on a "nobody has set this child anything" row with no subject filter. */
  subject: { id: string; code: string; name: string } | null;
  /** Null is the whole point of this screen: a pupil who has been missed. */
  goalId: string | null;
  targetMark: number | null;
  baselineMark: number | null;
  currentMark: number | null;
  onTrack: boolean | null;
  achievedAt: Date | null;
  plan: string | null;
  teacherNote: string | null;
};

/**
 * Every pupil's targets for a term — including the pupils who have none.
 *
 * `goalsForStudent` answers "what is this child aiming for", one child at a
 * time, which is the question a pupil and their teacher ask. A head asks the
 * opposite question: who has been *missed*. That cannot be answered from the
 * goals table, because a pupil nobody has set a target for has no row in it —
 * the same reason the homework board is built from the class roll outward. So
 * this starts from the roll and subtracts.
 *
 * With a subject chosen, "missed" narrows honestly: only pupils in a class that
 * actually takes that subject this term are expected to have a target in it.
 * Counting a Form 1 pupil as missing an A-level Biology goal would be a made-up
 * gap, and a made-up gap is worse than none — it is a to-do list nobody can
 * finish.
 */
export async function goalsOversight(input: {
  companyId: string;
  termId: string;
  classId?: string;
  subjectId?: string;
}) {
  // Which classes and streams take the chosen subject this term. Without a
  // subject filter every class is in scope and this query is not run.
  const taught = input.subjectId
    ? await prisma.schoolClassSubject.findMany({
        where: {
          companyId: input.companyId,
          termId: input.termId,
          subjectId: input.subjectId,
          isActive: true,
        },
        select: { classId: true, streamId: true },
      })
    : null;

  if (taught && taught.length === 0) {
    return {
      rows: [] as GoalOversightRow[],
      summary: { onRoll: 0, withGoal: 0, withoutGoal: 0, onTrack: 0, goals: 0 },
    };
  }

  const students = await prisma.schoolStudent.findMany({
    where: {
      companyId: input.companyId,
      status: "ACTIVE",
      ...(input.classId ? { currentClassId: input.classId } : {}),
      ...(taught
        ? {
            OR: taught.map((row) => ({
              currentClassId: row.classId,
              // A subject set for one stream is expected of that stream only.
              ...(row.streamId ? { currentStreamId: row.streamId } : {}),
            })),
          }
        : {}),
    },
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      currentClassId: true,
      currentClass: { select: { id: true, name: true, level: true } },
      currentStream: { select: { id: true, name: true } },
    },
    orderBy: [
      { currentClass: { level: "asc" } },
      { currentClass: { name: "asc" } },
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    take: 2000,
  });

  if (students.length === 0) {
    return {
      rows: [] as GoalOversightRow[],
      summary: { onRoll: 0, withGoal: 0, withoutGoal: 0, onTrack: 0, goals: 0 },
    };
  }

  const studentIds = students.map((row) => row.id);

  const [goals, lines, subject] = await Promise.all([
    prisma.schoolStudentGoal.findMany({
      where: {
        companyId: input.companyId,
        termId: input.termId,
        studentId: { in: studentIds },
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
      },
      select: {
        id: true,
        studentId: true,
        targetMark: true,
        baselineMark: true,
        plan: true,
        teacherNote: true,
        achievedAt: true,
        subject: { select: { id: true, code: true, name: true } },
      },
      orderBy: { subject: { name: "asc" } },
      take: 4000,
    }),
    prisma.schoolResultLine.findMany({
      where: {
        companyId: input.companyId,
        studentId: { in: studentIds },
        sheet: { termId: input.termId },
      },
      select: { studentId: true, subjectCode: true, score: true },
      take: 8000,
    }),
    input.subjectId
      ? prisma.schoolSubject.findFirst({
          where: { id: input.subjectId, companyId: input.companyId },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const markFor = new Map(
    lines.map((line) => [`${line.studentId}:${line.subjectCode}`, line.score]),
  );
  const goalsByStudent = new Map<string, typeof goals>();
  for (const goal of goals) {
    const bucket = goalsByStudent.get(goal.studentId);
    if (bucket) bucket.push(goal);
    else goalsByStudent.set(goal.studentId, [goal]);
  }

  const rows: GoalOversightRow[] = [];
  for (const student of students) {
    const identity = {
      studentId: student.id,
      studentNo: student.studentNo,
      firstName: student.firstName,
      lastName: student.lastName,
      classId: student.currentClass?.id ?? null,
      className: student.currentClass?.name ?? null,
      streamName: student.currentStream?.name ?? null,
    };

    const theirs = goalsByStudent.get(student.id) ?? [];
    if (theirs.length === 0) {
      // The row that only this screen draws. It carries the chosen subject when
      // there is one, so the head reads "no target in Mathematics" rather than
      // a blank they have to interpret.
      rows.push({
        ...identity,
        subject,
        goalId: null,
        targetMark: null,
        baselineMark: null,
        currentMark: subject
          ? (markFor.get(`${student.id}:${subject.code}`) ?? null)
          : null,
        onTrack: null,
        achievedAt: null,
        plan: null,
        teacherNote: null,
      });
      continue;
    }

    for (const goal of theirs) {
      const target = goal.targetMark === null ? null : Number(goal.targetMark);
      const current = markFor.get(`${student.id}:${goal.subject.code}`) ?? null;
      rows.push({
        ...identity,
        subject: goal.subject,
        goalId: goal.id,
        targetMark: target,
        baselineMark: goal.baselineMark === null ? null : Number(goal.baselineMark),
        currentMark: current,
        // Null when either side is missing: "on track" against no mark is a
        // claim nothing supports, and reading it as "behind" would put a child
        // on a chase list over a test nobody has marked.
        onTrack: target === null || current === null ? null : current >= target,
        achievedAt: goal.achievedAt,
        plan: goal.plan,
        teacherNote: goal.teacherNote,
      });
    }
  }

  const withGoal = students.filter(
    (student) => (goalsByStudent.get(student.id) ?? []).length > 0,
  ).length;

  return {
    rows,
    summary: {
      onRoll: students.length,
      withGoal,
      withoutGoal: students.length - withGoal,
      onTrack: rows.filter((row) => row.onTrack === true).length,
      goals: goals.length,
    },
  };
}

/**
 * Open a teacher's evening: a row per slot, all free.
 *
 * Slots are created empty rather than on booking, which is what lets a parent
 * see when the teacher is available. A list of bookings can only show when they
 * are not.
 */
export async function openMeetingSlots(input: {
  companyId: string;
  teacherProfileId: string;
  from: Date;
  to: Date;
  minutesEach: number;
  location?: string | null;
}) {
  if (input.minutesEach <= 0) {
    throw new MeetingError("A slot has to be longer than nothing");
  }
  if (input.to <= input.from) {
    throw new MeetingError("The evening has to end after it starts");
  }

  const span = input.to.getTime() - input.from.getTime();
  const count = Math.floor(span / (input.minutesEach * 60 * 1000));
  if (count === 0) throw new MeetingError("That window is shorter than one slot");
  if (count > 200) throw new MeetingError("That is more than 200 slots — narrow it");

  const existing = await prisma.schoolParentMeeting.findMany({
    where: {
      companyId: input.companyId,
      teacherProfileId: input.teacherProfileId,
      startsAt: { gte: input.from, lt: input.to },
      cancelledAt: null,
    },
    select: { startsAt: true },
  });
  const taken = new Set(existing.map((row) => row.startsAt.getTime()));

  const slots = Array.from({ length: count }, (_, index) => {
    const startsAt = new Date(
      input.from.getTime() + index * input.minutesEach * 60 * 1000,
    );
    return {
      companyId: input.companyId,
      teacherProfileId: input.teacherProfileId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.minutesEach * 60 * 1000),
      location: input.location ?? null,
    };
  }).filter((slot) => !taken.has(slot.startsAt.getTime()));

  if (slots.length === 0) {
    return { created: 0, skipped: count };
  }

  await prisma.schoolParentMeeting.createMany({ data: slots });
  return { created: slots.length, skipped: count - slots.length };
}

/**
 * Book a slot.
 *
 * The child's name and the booking time go on together — the database refuses
 * one without the other — because a slot that looks taken and names nobody
 * cannot be chased.
 */
export async function bookMeeting(input: {
  companyId: string;
  meetingId: string;
  studentId: string;
  guardianId?: string | null;
  notes?: string | null;
}) {
  const meeting = await prisma.schoolParentMeeting.findFirst({
    where: { id: input.meetingId, companyId: input.companyId },
    select: { id: true, bookedAt: true, cancelledAt: true },
  });
  if (!meeting) throw new MeetingError("Slot not found");
  if (meeting.cancelledAt) throw new MeetingError("That slot has been withdrawn");
  if (meeting.bookedAt) throw new MeetingError("Somebody has already taken that slot");

  return prisma.schoolParentMeeting.update({
    where: { id: meeting.id },
    data: {
      studentId: input.studentId,
      guardianId: input.guardianId ?? null,
      notes: input.notes ?? null,
      bookedAt: new Date(),
    },
    select: { id: true, bookedAt: true, studentId: true },
  });
}

/** Give a slot back. */
export async function releaseMeeting(input: {
  companyId: string;
  meetingId: string;
}) {
  const meeting = await prisma.schoolParentMeeting.findFirst({
    where: { id: input.meetingId, companyId: input.companyId },
    select: { id: true, bookedAt: true },
  });
  if (!meeting) throw new MeetingError("Slot not found");
  if (!meeting.bookedAt) throw new MeetingError("That slot is already free");

  return prisma.schoolParentMeeting.update({
    where: { id: meeting.id },
    data: { studentId: null, guardianId: null, bookedAt: null, notes: null },
    select: { id: true, bookedAt: true },
  });
}

/**
 * A teacher's evening, free slots included. Omit the teacher for the whole
 * school's, which is what the office needs to run a parents' evening.
 *
 * The guardian comes back alongside the pupil. A booking names both — the
 * child the meeting is about and the adult who is coming — and the office
 * cannot ring anyone about a cancellation from the child's name alone.
 */
export async function meetingSchedule(input: {
  companyId: string;
  teacherProfileId?: string;
  from: Date;
  to: Date;
}) {
  return prisma.schoolParentMeeting.findMany({
    where: {
      companyId: input.companyId,
      ...(input.teacherProfileId ? { teacherProfileId: input.teacherProfileId } : {}),
      startsAt: { gte: input.from, lt: input.to },
      cancelledAt: null,
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      location: true,
      notes: true,
      outcome: true,
      bookedAt: true,
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          currentClass: { select: { id: true, name: true } },
        },
      },
      guardian: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
      teacherProfile: {
        select: { id: true, user: { select: { name: true, image: true } } },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 400,
  });
}
