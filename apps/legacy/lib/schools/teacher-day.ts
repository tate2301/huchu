import { prisma } from "@corelithzw/db/client";
import { formatMinute } from "@/lib/schools/timetable-format";

/**
 * What a teacher's day looks like from their side of the staffroom door.
 *
 * The admin dashboard asks "which registers are unmarked across the school".
 * A teacher asks "what am I teaching next and have I taken that register" —
 * same tables, opposite direction. This module answers the second question,
 * and only ever about the teacher asking it.
 *
 * Everything is built outward from the timetable rather than from what has
 * been recorded, so a period nobody marked is a row on the screen instead of
 * a silence.
 */

export type TeacherPeriod = {
  periodId: string;
  slotId: string | null;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  startsAt: string;
  endsAt: string;
  /** Null for a free period — the teacher is not timetabled against it. */
  lesson: {
    classSubjectId: string;
    classId: string;
    className: string;
    classCode: string;
    streamId: string | null;
    streamName: string | null;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    roomName: string | null;
  } | null;
  /** Whether a register exists for that class today, and whether it is locked. */
  register: { sessionId: string; status: string; marked: number } | null;
};

export type TeacherClass = {
  classSubjectId: string;
  classId: string;
  classCode: string;
  className: string;
  streamId: string | null;
  streamName: string | null;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  size: number;
};

/** Local Y-M-D midnight, matching how attendance dates are stored. */
function dayOnly(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** ISO-8601 day of week, 1 = Monday, which is what timetable slots use. */
export function isoDayOfWeek(value: Date) {
  const day = value.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * The classes a teacher actually teaches this term, with roll sizes.
 *
 * Sized from the students on the class rather than from an enrolment count:
 * the roll is what walks through the door, and it is what the register, the
 * mark sheet and the homework board all count against.
 */
export async function teacherClasses(input: {
  companyId: string;
  teacherProfileId: string;
  termId: string;
}): Promise<TeacherClass[]> {
  const assignments = await prisma.schoolClassSubject.findMany({
    where: {
      companyId: input.companyId,
      teacherProfileId: input.teacherProfileId,
      termId: input.termId,
      isActive: true,
    },
    select: {
      id: true,
      classId: true,
      streamId: true,
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ class: { level: "asc" } }, { subject: { name: "asc" } }],
  });

  if (assignments.length === 0) return [];

  const sizes = await prisma.schoolStudent.groupBy({
    by: ["currentClassId", "currentStreamId"],
    where: {
      companyId: input.companyId,
      status: "ACTIVE",
      currentClassId: { in: assignments.map((row) => row.classId) },
    },
    _count: { _all: true },
  });

  const sizeFor = (classId: string, streamId: string | null) => {
    // A subject taught to a whole form counts the form; taught to one stream,
    // it counts that stream.
    if (streamId) {
      return (
        sizes.find(
          (row) => row.currentClassId === classId && row.currentStreamId === streamId,
        )?._count._all ?? 0
      );
    }
    return sizes
      .filter((row) => row.currentClassId === classId)
      .reduce((total, row) => total + row._count._all, 0);
  };

  return assignments.map((row) => ({
    classSubjectId: row.id,
    classId: row.class.id,
    classCode: row.class.code,
    className: row.class.name,
    streamId: row.stream?.id ?? null,
    streamName: row.stream?.name ?? null,
    subjectId: row.subject.id,
    subjectCode: row.subject.code,
    subjectName: row.subject.name,
    size: sizeFor(row.classId, row.streamId),
  }));
}

/**
 * One day of a teacher's timetable, every period of the school day included.
 *
 * Free periods are rows too. A day that only listed the lessons would read as
 * a shorter day than it is, and "when am I free" is the question a teacher
 * asks a timetable most often.
 */
export async function teacherPeriods(input: {
  companyId: string;
  teacherProfileId: string;
  termId: string;
  onDate: Date;
}): Promise<TeacherPeriod[]> {
  const dayOfWeek = isoDayOfWeek(input.onDate);
  const attendanceDate = dayOnly(input.onDate);

  const [periods, slots] = await Promise.all([
    prisma.schoolPeriod.findMany({
      where: {
        companyId: input.companyId,
        OR: [{ termId: input.termId }, { termId: null }],
      },
      select: {
        id: true,
        code: true,
        name: true,
        startMinute: true,
        endMinute: true,
        isTeaching: true,
        sequence: true,
      },
      orderBy: { sequence: "asc" },
    }),
    prisma.schoolTimetableSlot.findMany({
      where: {
        companyId: input.companyId,
        termId: input.termId,
        teacherProfileId: input.teacherProfileId,
        dayOfWeek,
      },
      select: {
        id: true,
        periodId: true,
        classSubjectId: true,
        classId: true,
        streamId: true,
        class: { select: { code: true, name: true } },
        stream: { select: { name: true } },
        room: { select: { name: true } },
        classSubject: {
          select: { subject: { select: { id: true, code: true, name: true } } },
        },
      },
    }),
  ]);

  const teachingPeriods = periods.filter((period) => period.isTeaching);
  const slotByPeriod = new Map(slots.map((slot) => [slot.periodId, slot]));

  const registers = slots.length
    ? await prisma.schoolAttendanceSession.findMany({
        where: {
          companyId: input.companyId,
          termId: input.termId,
          attendanceDate,
          classId: { in: slots.map((slot) => slot.classId) },
        },
        select: {
          id: true,
          classId: true,
          streamId: true,
          status: true,
          _count: { select: { lines: true } },
        },
      })
    : [];

  return teachingPeriods.map((period) => {
    const slot = slotByPeriod.get(period.id) ?? null;
    const register = slot
      ? (registers.find(
          (row) => row.classId === slot.classId && row.streamId === slot.streamId,
        ) ?? null)
      : null;

    return {
      periodId: period.id,
      slotId: slot?.id ?? null,
      code: period.code,
      name: period.name,
      startMinute: period.startMinute,
      endMinute: period.endMinute,
      startsAt: formatMinute(period.startMinute),
      endsAt: formatMinute(period.endMinute),
      lesson: slot
        ? {
            classSubjectId: slot.classSubjectId,
            classId: slot.classId,
            className: slot.class.name,
            classCode: slot.class.code,
            streamId: slot.streamId,
            streamName: slot.stream?.name ?? null,
            subjectId: slot.classSubject.subject.id,
            subjectName: slot.classSubject.subject.name,
            subjectCode: slot.classSubject.subject.code,
            roomName: slot.room?.name ?? null,
          }
        : null,
      register: register
        ? {
            sessionId: register.id,
            status: register.status,
            marked: register._count.lines,
          }
        : null,
    };
  });
}

/**
 * The three numbers a teacher looks at before the bell.
 *
 * Papers to mark counts assessments with at least one student still unscored,
 * not assessments that exist — a test everyone has been marked for is done,
 * whatever its status field says.
 */
export async function teacherWorkload(input: {
  companyId: string;
  teacherProfileId: string;
  termId: string;
}) {
  const classSubjects = await prisma.schoolClassSubject.findMany({
    where: {
      companyId: input.companyId,
      teacherProfileId: input.teacherProfileId,
      termId: input.termId,
      isActive: true,
    },
    select: { id: true, classId: true, streamId: true },
  });

  if (classSubjects.length === 0) {
    return { papersToMark: 0, homeworkOpen: 0, unmarkedRegisters: 0, marking: [] };
  }

  const ids = classSubjects.map((row) => row.id);
  const now = new Date();

  const [assessments, assignments] = await Promise.all([
    prisma.schoolAssessment.findMany({
      where: { companyId: input.companyId, classSubjectId: { in: ids }, status: "OPEN" },
      select: {
        id: true,
        title: true,
        kind: true,
        maxScore: true,
        assessedOn: true,
        classSubject: {
          select: {
            classId: true,
            streamId: true,
            class: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
        _count: { select: { scores: true } },
      },
      orderBy: { assessedOn: "desc" },
      take: 20,
    }),
    prisma.schoolAssignment.count({
      where: {
        companyId: input.companyId,
        classSubjectId: { in: ids },
        publishedAt: { not: null },
        OR: [{ dueAt: null }, { dueAt: { gte: now } }],
      },
    }),
  ]);

  const rollSizes = await prisma.schoolStudent.groupBy({
    by: ["currentClassId", "currentStreamId"],
    where: {
      companyId: input.companyId,
      status: "ACTIVE",
      currentClassId: { in: classSubjects.map((row) => row.classId) },
    },
    _count: { _all: true },
  });
  const rollFor = (classId: string, streamId: string | null) =>
    streamId
      ? (rollSizes.find(
          (row) => row.currentClassId === classId && row.currentStreamId === streamId,
        )?._count._all ?? 0)
      : rollSizes
          .filter((row) => row.currentClassId === classId)
          .reduce((total, row) => total + row._count._all, 0);

  const marking = assessments
    .map((row) => {
      const expected = rollFor(row.classSubject.classId, row.classSubject.streamId);
      return {
        assessmentId: row.id,
        title: row.title,
        kind: row.kind,
        className: row.classSubject.class.name,
        subjectName: row.classSubject.subject.name,
        assessedOn: row.assessedOn,
        expected,
        marked: row._count.scores,
        outstanding: Math.max(0, expected - row._count.scores),
      };
    })
    .filter((row) => row.outstanding > 0);

  return {
    papersToMark: marking.reduce((total, row) => total + row.outstanding, 0),
    homeworkOpen: assignments,
    marking,
  };
}
