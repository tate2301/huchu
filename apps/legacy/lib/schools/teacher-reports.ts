import { prisma } from "@corelithzw/db/client";
import { computeClassTermMarks } from "@/lib/schools/assessments";
import { teacherClasses, type TeacherClass } from "@/lib/schools/teacher-day";

/**
 * How a teacher's own classes are doing.
 *
 * The admin dashboard asks "which classes across the school are behind"; a
 * teacher asks "how are mine doing and what do I do about it". Same tables,
 * opposite direction — the same split `teacher-day.ts` already draws for the
 * timetable, drawn again for the term's numbers.
 *
 * Every figure here is counted from rows that exist. There are no deltas
 * against last term, no "distinctions" that no band defines and no projected
 * grades: the demo's report screen shows several of those, and a number a
 * teacher cannot trace back to a list is worse than no number at all. What is
 * here, each screen figure can be opened into the list behind it.
 *
 * Three deliberate counting decisions, because each one has a wrong answer that
 * looks identical on screen:
 *
 * - **Attendance is counted per register, not per lesson.** A register belongs
 *   to a class and a day, not to a subject, so a teacher who takes 2A for three
 *   subjects sees 2A's attendance once rather than three times. Whole-form
 *   assignments count every stream's register; a stream-specific assignment
 *   counts only that stream's.
 * - **Late counts as attending.** A child who arrived is in the room. Lateness
 *   is broken out separately so the rate can be read with it rather than
 *   through it.
 * - **Homework expects a hand-in from every child on the roll.** "Not handed
 *   in" is the absence of a submission row, so the denominator has to come from
 *   the roll; counting submissions against submissions would report 100% for a
 *   class where two pupils bothered.
 */

/** A register's worth of marks, rolled up. */
export type AttendanceCounts = {
  /** Registers taken. */
  sessions: number;
  /** Marks recorded across those registers. */
  recorded: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** `(present + late) / recorded`, 0–1. Null when nothing has been recorded. */
  rate: number | null;
};

export type MarkBandCount = {
  grade: string;
  minScore: number;
  maxScore: number;
  count: number;
};

export type MarkDistribution = {
  /** The grading scheme the bands come from. */
  scheme: string;
  passMark: number;
  /** Children with a term mark in this subject. */
  marked: number;
  /** Children on the roll with nothing marked yet. */
  unmarked: number;
  /** Mean of the term marks that exist, 0–100. Null when none do. */
  average: number | null;
  /** Children at or above the scheme's pass mark. */
  passed: number;
  bands: MarkBandCount[];
};

export type HomeworkCounts = {
  /** Published pieces of homework this term. */
  assignments: number;
  /** One hand-in expected per child per published piece. */
  expected: number;
  handedIn: number;
  /** Handed in after the deadline. Counted inside `handedIn`, not beside it. */
  late: number;
  /** `handedIn / expected`, 0–1. Null when nothing has been set. */
  rate: number | null;
};

export type TeacherClassReport = TeacherClass & {
  attendance: AttendanceCounts;
  marks: MarkDistribution;
  homework: HomeworkCounts;
};

/** One week of registers, across every class the teacher takes. */
export type AttendanceWeek = {
  /** Monday of the week, `YYYY-MM-DD`. */
  weekStart: string;
  recorded: number;
  present: number;
  late: number;
  rate: number | null;
};

export type AtRiskStudent = {
  studentId: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  className: string | null;
  streamName: string | null;
  attendanceRate: number | null;
  recorded: number;
  /** The worst term mark this teacher holds for the child. */
  lowestMark: number | null;
  lowestSubject: string | null;
  /** Why the child is on the list, in the teacher's words. */
  reasons: string[];
};

export type TeacherReport = {
  termId: string;
  classes: TeacherClassReport[];
  weeks: AttendanceWeek[];
  atRisk: AtRiskStudent[];
  totals: {
    attendance: AttendanceCounts;
    homework: HomeworkCounts;
    /** Term marks held across every class. */
    marked: number;
    /** Children on those rolls — the denominator `marked` is short of. */
    roll: number;
    passed: number;
    average: number | null;
  };
};

/** A child below this is flagged, and needs this many marks to be judged. */
const ATTENDANCE_FLOOR = 0.8;
const ATTENDANCE_MINIMUM_RECORDS = 5;
/** A term mark below this is flagged whatever the scheme's pass mark is. */
const MARK_FLOOR = 40;

const EMPTY_ATTENDANCE: AttendanceCounts = {
  sessions: 0,
  recorded: 0,
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  rate: null,
};

/** Monday of the week a date falls in, as `YYYY-MM-DD`. */
function weekStartOf(date: Date) {
  const day = date.getUTCDay();
  const backToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(date.getTime() - backToMonday * 24 * 60 * 60 * 1000);
  return monday.toISOString().slice(0, 10);
}

function rateOf(counts: {
  present: number;
  late: number;
  recorded: number;
}): number | null {
  return counts.recorded === 0 ? null : (counts.present + counts.late) / counts.recorded;
}

function addStatus(target: AttendanceCounts, status: string, count: number) {
  target.recorded += count;
  if (status === "PRESENT") target.present += count;
  else if (status === "ABSENT") target.absent += count;
  else if (status === "LATE") target.late += count;
  else if (status === "EXCUSED") target.excused += count;
}

/**
 * The whole report, in a fixed number of queries.
 *
 * Attendance is two `groupBy` calls rather than a read of every line: a term of
 * registers for five classes is over ten thousand rows and the report needs
 * four counts from them. Marks are the exception — `computeClassTermMarks`
 * runs per class-subject, because it resolves a grading scheme and weights
 * continuous against exam marks, and reimplementing that here to save a query
 * would give the marks book and this screen two different answers.
 */
export async function teacherReport(input: {
  companyId: string;
  teacherProfileId: string;
  termId: string;
}): Promise<TeacherReport> {
  const classes = await teacherClasses({
    companyId: input.companyId,
    teacherProfileId: input.teacherProfileId,
    termId: input.termId,
  });

  if (classes.length === 0) {
    return {
      termId: input.termId,
      classes: [],
      weeks: [],
      atRisk: [],
      totals: {
        attendance: { ...EMPTY_ATTENDANCE },
        homework: { assignments: 0, expected: 0, handedIn: 0, late: 0, rate: null },
        marked: 0,
        roll: 0,
        passed: 0,
        average: null,
      },
    };
  }

  const classIds = [...new Set(classes.map((row) => row.classId))];
  const classSubjectIds = classes.map((row) => row.classSubjectId);

  // A teacher taking a whole form sees every stream's register; one taking a
  // single stream sees only theirs.
  const wholeForm = new Set(
    classes.filter((row) => row.streamId === null).map((row) => row.classId),
  );
  const streamPairs = new Set(
    classes
      .filter((row) => row.streamId !== null)
      .map((row) => `${row.classId}:${row.streamId}`),
  );
  const takesRegisterFor = (classId: string, streamId: string | null) =>
    wholeForm.has(classId) || streamPairs.has(`${classId}:${streamId}`);

  const [allSessions, assignments] = await Promise.all([
    prisma.schoolAttendanceSession.findMany({
      where: { companyId: input.companyId, termId: input.termId, classId: { in: classIds } },
      select: { id: true, classId: true, streamId: true, attendanceDate: true },
    }),
    prisma.schoolAssignment.findMany({
      where: {
        companyId: input.companyId,
        termId: input.termId,
        classSubjectId: { in: classSubjectIds },
        publishedAt: { not: null },
      },
      select: { id: true, classSubjectId: true },
    }),
  ]);

  const sessions = allSessions.filter((row) => takesRegisterFor(row.classId, row.streamId));
  const sessionIds = sessions.map((row) => row.id);
  const assignmentIds = assignments.map((row) => row.id);

  const [bySession, byStudent, submissions] = await Promise.all([
    sessionIds.length
      ? prisma.schoolAttendanceSessionLine.groupBy({
          by: ["sessionId", "status"],
          where: { companyId: input.companyId, sessionId: { in: sessionIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    sessionIds.length
      ? prisma.schoolAttendanceSessionLine.groupBy({
          by: ["studentId", "status"],
          where: { companyId: input.companyId, sessionId: { in: sessionIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    assignmentIds.length
      ? prisma.schoolAssignmentSubmission.groupBy({
          by: ["assignmentId", "status"],
          where: { companyId: input.companyId, assignmentId: { in: assignmentIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const sessionById = new Map(sessions.map((row) => [row.id, row]));

  // Registers roll up two ways at once: by the class they belong to, and by the
  // week they were taken in.
  const attendanceByClass = new Map<string, AttendanceCounts>();
  const attendanceByWeek = new Map<string, AttendanceWeek>();
  for (const session of sessions) {
    const key = `${session.classId}:${session.streamId ?? ""}`;
    const bucket = attendanceByClass.get(key) ?? { ...EMPTY_ATTENDANCE };
    bucket.sessions += 1;
    attendanceByClass.set(key, bucket);
  }
  for (const row of bySession) {
    const session = sessionById.get(row.sessionId);
    if (!session) continue;
    const key = `${session.classId}:${session.streamId ?? ""}`;
    const bucket = attendanceByClass.get(key) ?? { ...EMPTY_ATTENDANCE };
    addStatus(bucket, row.status, row._count._all);
    attendanceByClass.set(key, bucket);

    const weekStart = weekStartOf(session.attendanceDate);
    const week = attendanceByWeek.get(weekStart) ?? {
      weekStart,
      recorded: 0,
      present: 0,
      late: 0,
      rate: null,
    };
    week.recorded += row._count._all;
    if (row.status === "PRESENT") week.present += row._count._all;
    if (row.status === "LATE") week.late += row._count._all;
    attendanceByWeek.set(weekStart, week);
  }

  const weeks = [...attendanceByWeek.values()]
    .map((week) => ({ ...week, rate: rateOf(week) }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // Per child, so a class rate of 94% can be opened into the four pupils
  // dragging it down.
  const attendanceByStudent = new Map<string, AttendanceCounts>();
  for (const row of byStudent) {
    const bucket = attendanceByStudent.get(row.studentId) ?? { ...EMPTY_ATTENDANCE };
    addStatus(bucket, row.status, row._count._all);
    attendanceByStudent.set(row.studentId, bucket);
  }

  const homeworkByClassSubject = new Map<string, { assignments: number; ids: string[] }>();
  for (const row of assignments) {
    const bucket = homeworkByClassSubject.get(row.classSubjectId) ?? {
      assignments: 0,
      ids: [],
    };
    bucket.assignments += 1;
    bucket.ids.push(row.id);
    homeworkByClassSubject.set(row.classSubjectId, bucket);
  }
  const submissionsByAssignment = new Map<string, { handedIn: number; late: number }>();
  for (const row of submissions) {
    const bucket = submissionsByAssignment.get(row.assignmentId) ?? { handedIn: 0, late: 0 };
    // A row exists only once a child has handed something over, whatever state
    // it is now in — marked, returned, sent back to be done again.
    bucket.handedIn += row._count._all;
    if (row.status === "LATE") bucket.late += row._count._all;
    submissionsByAssignment.set(row.assignmentId, bucket);
  }

  // The worst mark this teacher holds for each child, for the at-risk list.
  const lowestByStudent = new Map<string, { mark: number; subject: string }>();

  const reports: TeacherClassReport[] = [];
  for (const row of classes) {
    const { scheme, marks } = await computeClassTermMarks({
      companyId: input.companyId,
      termId: input.termId,
      classId: row.classId,
      streamId: row.streamId,
      classSubjectId: row.classSubjectId,
    });

    const scored = marks.filter(
      (mark): mark is (typeof marks)[number] & { mark: number } => mark.mark !== null,
    );
    for (const mark of scored) {
      const held = lowestByStudent.get(mark.studentId);
      if (!held || mark.mark < held.mark) {
        lowestByStudent.set(mark.studentId, {
          mark: mark.mark,
          subject: mark.subject.name,
        });
      }
    }

    const bands = scheme.bands.map((band) => ({
      grade: band.grade,
      minScore: band.minScore,
      maxScore: band.maxScore,
      count: scored.filter((mark) => mark.grade?.grade === band.grade).length,
    }));

    const homework = homeworkByClassSubject.get(row.classSubjectId) ?? {
      assignments: 0,
      ids: [] as string[],
    };
    const handed = homework.ids.reduce(
      (total, id) => {
        const bucket = submissionsByAssignment.get(id);
        return {
          handedIn: total.handedIn + (bucket?.handedIn ?? 0),
          late: total.late + (bucket?.late ?? 0),
        };
      },
      { handedIn: 0, late: 0 },
    );
    const expected = homework.assignments * row.size;

    // A teacher of a whole form reads every stream's register together; a
    // teacher of one stream reads only that stream's. Copied out of the map
    // rather than read through it, because two subjects taught to the same
    // class would otherwise accumulate into the same object twice.
    const attendance: AttendanceCounts = { ...EMPTY_ATTENDANCE };
    for (const [key, counts] of attendanceByClass) {
      const wanted =
        row.streamId === null
          ? key.startsWith(`${row.classId}:`)
          : key === `${row.classId}:${row.streamId}`;
      if (!wanted) continue;
      attendance.sessions += counts.sessions;
      attendance.recorded += counts.recorded;
      attendance.present += counts.present;
      attendance.absent += counts.absent;
      attendance.late += counts.late;
      attendance.excused += counts.excused;
    }

    reports.push({
      ...row,
      attendance: { ...attendance, rate: rateOf(attendance) },
      marks: {
        scheme: scheme.name,
        passMark: scheme.passMark,
        marked: scored.length,
        unmarked: Math.max(0, row.size - scored.length),
        average:
          scored.length === 0
            ? null
            : scored.reduce((total, mark) => total + mark.mark, 0) / scored.length,
        passed: scored.filter((mark) => mark.mark >= scheme.passMark).length,
        bands,
      },
      homework: {
        assignments: homework.assignments,
        expected,
        handedIn: handed.handedIn,
        late: handed.late,
        rate: expected === 0 ? null : handed.handedIn / expected,
      },
    });
  }

  const flagged = new Set<string>();
  for (const [studentId, counts] of attendanceByStudent) {
    const rate = rateOf(counts);
    if (rate !== null && counts.recorded >= ATTENDANCE_MINIMUM_RECORDS && rate < ATTENDANCE_FLOOR) {
      flagged.add(studentId);
    }
  }
  for (const [studentId, held] of lowestByStudent) {
    if (held.mark < MARK_FLOOR) flagged.add(studentId);
  }

  const flaggedIds = [...flagged];
  const people = flaggedIds.length
    ? await prisma.schoolStudent.findMany({
        where: { companyId: input.companyId, id: { in: flaggedIds } },
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          currentClass: { select: { name: true } },
          currentStream: { select: { name: true } },
        },
      })
    : [];

  const atRisk: AtRiskStudent[] = people
    .map((person) => {
      const counts = attendanceByStudent.get(person.id) ?? { ...EMPTY_ATTENDANCE };
      const rate = rateOf(counts);
      const held = lowestByStudent.get(person.id) ?? null;
      const reasons: string[] = [];
      if (
        rate !== null &&
        counts.recorded >= ATTENDANCE_MINIMUM_RECORDS &&
        rate < ATTENDANCE_FLOOR
      ) {
        reasons.push(`In for ${Math.round(rate * 100)}% of ${counts.recorded} registers`);
      }
      if (held && held.mark < MARK_FLOOR) {
        reasons.push(`${held.subject} term mark ${Math.round(held.mark)}%`);
      }
      return {
        studentId: person.id,
        studentNo: person.studentNo,
        firstName: person.firstName,
        lastName: person.lastName,
        className: person.currentClass?.name ?? null,
        streamName: person.currentStream?.name ?? null,
        attendanceRate: rate,
        recorded: counts.recorded,
        lowestMark: held?.mark ?? null,
        lowestSubject: held?.subject ?? null,
        reasons,
      };
    })
    .sort((a, b) => (a.attendanceRate ?? 1) - (b.attendanceRate ?? 1));

  const totalAttendance = reports.reduce<AttendanceCounts>(
    (total, row) => ({
      sessions: total.sessions + row.attendance.sessions,
      recorded: total.recorded + row.attendance.recorded,
      present: total.present + row.attendance.present,
      absent: total.absent + row.attendance.absent,
      late: total.late + row.attendance.late,
      excused: total.excused + row.attendance.excused,
      rate: null,
    }),
    { ...EMPTY_ATTENDANCE },
  );
  const totalHomework = reports.reduce(
    (total, row) => ({
      assignments: total.assignments + row.homework.assignments,
      expected: total.expected + row.homework.expected,
      handedIn: total.handedIn + row.homework.handedIn,
      late: total.late + row.homework.late,
      rate: null as number | null,
    }),
    { assignments: 0, expected: 0, handedIn: 0, late: 0, rate: null as number | null },
  );
  const marked = reports.reduce((total, row) => total + row.marks.marked, 0);
  const weightedAverage = reports.reduce(
    (total, row) => total + (row.marks.average ?? 0) * row.marks.marked,
    0,
  );

  return {
    termId: input.termId,
    classes: reports,
    weeks,
    atRisk,
    totals: {
      attendance: { ...totalAttendance, rate: rateOf(totalAttendance) },
      homework: {
        ...totalHomework,
        rate: totalHomework.expected === 0 ? null : totalHomework.handedIn / totalHomework.expected,
      },
      marked,
      roll: reports.reduce((total, row) => total + row.size, 0),
      passed: reports.reduce((total, row) => total + row.marks.passed, 0),
      average: marked === 0 ? null : weightedAverage / marked,
    },
  };
}
