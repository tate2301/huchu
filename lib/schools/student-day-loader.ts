import { prisma } from "@/lib/prisma";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { formatMinute } from "@/lib/schools/timetable-format";
import { isoDayOfWeek } from "@/lib/schools/teacher-day";

/** One piece of homework the pupil has not handed in, soonest deadline first. */
type DueSoon = {
  id: string;
  title: string;
  subjectName: string;
  /** Whole days left, negative once the deadline has passed. Null: no date. */
  dueInDays: number | null;
  isOverdue: boolean;
};

/** How many of the soonest deadlines Home has room for. */
const DUE_SOON_SHOWN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The counters every screen's chrome needs before anything else has loaded.
 *
 * Kept as one literal so a pupil with no class, no term or no record gets the
 * same shape as one in the middle of term — a tile reading `undefined` is the
 * failure this shape exists to prevent.
 */
const NO_COUNTS = {
  homework: { due: 0, overdue: 0, soon: [] as DueSoon[] },
  latestMark: null as {
    subject: string;
    score: number;
    delta: number | null;
  } | null,
  unread: 0,
  library: { out: 0, overdue: 0, fines: 0 },
};

/**
 * A pupil's day, loaded on the server for the student portal's shell.
 *
 * The same shape of answer as `teacher-day-loader.ts` and for the same
 * reasons: the portal's chrome cannot paint until it knows whose portal it is,
 * and a shell that fetches its own identity flashes a stranger's empty state
 * at whoever is holding the phone.
 *
 * The counters travel with it — what is due, the last mark, unread messages,
 * books out — because they are what the bell badge and Home's tiles are made
 * of, and four spinners above the fold is not a glance. They are counts and
 * three rows, not the screens' own data: Homework, Marks and Library each
 * still fetch their own.
 *
 * Everything is resolved from the signed-in user's own student record. A pupil
 * naming somebody else gets nothing — that rule lives in `portal-identity.ts`
 * and this module never takes an id from the caller at all.
 */
export async function loadStudentDay(input: {
  companyId: string;
  userId: string;
  onDate?: Date;
}) {
  const [student, school] = await Promise.all([
    prisma.schoolStudent.findFirst({
      where: { companyId: input.companyId, userId: input.userId },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
        isBoarding: true,
        currentClassId: true,
        currentStreamId: true,
        currentClass: { select: { id: true, code: true, name: true } },
        currentStream: { select: { id: true, name: true } },
        user: { select: { name: true, email: true, image: true } },
      },
    }),
    loadSchool(input.companyId),
  ]);

  if (!student) {
    return { student: null, school, term: null, periods: [], ...NO_COUNTS };
  }

  const onDate = input.onDate ?? new Date();

  const [term, unread, library, latestMark] = await Promise.all([
    getCurrentTerm(input.companyId),
    // Notices reach a pupil as notifications, which already carry read state
    // per recipient — so the badge is a real count rather than a dot that is
    // always on.
    prisma.notificationRecipient.count({
      where: { userId: input.userId, isRead: false, isArchived: false },
    }),
    loadLibrary(input.companyId, student.id, onDate),
    loadLatestMark(input.companyId, student.id),
  ]);

  if (!term || !student.currentClassId) {
    return {
      student,
      school,
      term: term ?? null,
      periods: [],
      ...NO_COUNTS,
      unread,
      library,
      latestMark,
    };
  }

  const dayOfWeek = isoDayOfWeek(onDate);

  const [periods, slots, homework] = await Promise.all([
    prisma.schoolPeriod.findMany({
      where: {
        companyId: input.companyId,
        OR: [{ termId: term.id }, { termId: null }],
        isTeaching: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        startMinute: true,
        endMinute: true,
      },
      orderBy: { sequence: "asc" },
    }),
    prisma.schoolTimetableSlot.findMany({
      where: {
        companyId: input.companyId,
        termId: term.id,
        classId: student.currentClassId,
        dayOfWeek,
        ...(student.currentStreamId
          ? { OR: [{ streamId: student.currentStreamId }, { streamId: null }] }
          : {}),
      },
      select: {
        periodId: true,
        room: { select: { name: true } },
        classSubject: {
          select: {
            subject: { select: { id: true, code: true, name: true } },
            teacherProfile: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
    loadHomework({
      companyId: input.companyId,
      termId: term.id,
      student: {
        id: student.id,
        currentClassId: student.currentClassId,
        currentStreamId: student.currentStreamId,
      },
      at: onDate,
    }),
  ]);

  const byPeriod = new Map(slots.map((slot) => [slot.periodId, slot]));

  return {
    student,
    school,
    term: { id: term.id, code: term.code, name: term.name },
    onDate: onDate.toISOString().slice(0, 10),
    unread,
    library,
    latestMark,
    homework,
    // Free periods are rows here too: a pupil's day is the school's day, and
    // one that only listed lessons would read as a shorter day than it is.
    periods: periods.map((period) => {
      const slot = byPeriod.get(period.id) ?? null;
      return {
        periodId: period.id,
        code: period.code,
        name: period.name,
        startMinute: period.startMinute,
        endMinute: period.endMinute,
        startsAt: formatMinute(period.startMinute),
        endsAt: formatMinute(period.endMinute),
        lesson: slot
          ? {
              subjectId: slot.classSubject.subject.id,
              subjectName: slot.classSubject.subject.name,
              subjectCode: slot.classSubject.subject.code,
              roomName: slot.room?.name ?? null,
              teacherName: slot.classSubject.teacherProfile?.user?.name ?? null,
            }
          : null,
      };
    }),
  };
}

/**
 * The school itself, and how a pupil reaches the office.
 *
 * The contact details are the tenant's own branding record — the same address
 * and number printed on its invoices — so Help sends a child to the office the
 * school actually answers rather than to a support address they have never
 * heard of.
 */
async function loadSchool(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      branding: { select: { displayName: true, email: true, phone: true } },
    },
  });
  if (!company) return null;
  return {
    name: company.branding?.displayName ?? company.name,
    email: company.branding?.email ?? null,
    phone: company.branding?.phone ?? null,
  };
}

/** Books out, how many are late, and what is owed on the ones already back. */
async function loadLibrary(companyId: string, studentId: string, at: Date) {
  const [loans, fines] = await Promise.all([
    prisma.schoolBookLoan.findMany({
      where: { companyId, studentId, returnedAt: null },
      select: { dueAt: true },
    }),
    prisma.schoolBookLoan.aggregate({
      where: { companyId, studentId, fineAmount: { gt: 0 }, finePaidAt: null },
      _sum: { fineAmount: true },
    }),
  ]);

  return {
    out: loans.length,
    overdue: loans.filter((loan) => loan.dueAt.getTime() < at.getTime()).length,
    fines: Number(fines._sum.fineAmount ?? 0),
  };
}

/**
 * The last mark the school published, against the one before it in the same
 * subject.
 *
 * A score on its own says nothing — "78" is only worth reading next to the 74
 * it came after — so the delta is worked out here rather than left to a tile
 * that has one number. Unpublished sheets are invisible, as everywhere else a
 * pupil reads their marks.
 */
async function loadLatestMark(companyId: string, studentId: string) {
  const lines = await prisma.schoolResultLine.findMany({
    where: { companyId, studentId, sheet: { status: "PUBLISHED" } },
    select: {
      sheetId: true,
      subjectCode: true,
      score: true,
      sheet: { select: { publishedAt: true } },
    },
    orderBy: { sheet: { publishedAt: "desc" } },
    take: 60,
  });

  const latest = lines[0];
  if (!latest) return null;

  const before = lines.find(
    (line) =>
      line.subjectCode === latest.subjectCode &&
      line.sheetId !== latest.sheetId,
  );
  const subject = await prisma.schoolSubject.findFirst({
    where: { companyId, code: latest.subjectCode },
    select: { name: true },
  });

  return {
    subject: subject?.name ?? latest.subjectCode,
    score: Math.round(latest.score),
    delta: before ? Math.round(latest.score - before.score) : null,
  };
}

/**
 * What is still to hand in, and the three deadlines closest to now.
 *
 * "Due" is work with no submission against it, which is the pupil's own
 * question — a class-wide count of who has handed in is the teacher's. Lateness
 * is decided against the server's clock for the same reason the homework route
 * decides it there: a phone with the wrong date would otherwise disagree with
 * the teacher about whether the work is late.
 */
async function loadHomework(input: {
  companyId: string;
  termId: string;
  student: {
    id: string;
    currentClassId: string;
    currentStreamId: string | null;
  };
  at: Date;
}) {
  const assignments = await prisma.schoolAssignment.findMany({
    where: {
      companyId: input.companyId,
      termId: input.termId,
      isPublished: true,
      classSubject: {
        classId: input.student.currentClassId,
        // A class subject with no stream is taught to the whole class; one
        // with a stream is taught to that stream only. Both are this child's
        // work, and nobody else's stream is.
        ...(input.student.currentStreamId
          ? {
              OR: [
                { streamId: null },
                { streamId: input.student.currentStreamId },
              ],
            }
          : { streamId: null }),
      },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      classSubject: { select: { subject: { select: { name: true } } } },
    },
    orderBy: [{ dueAt: "asc" }, { publishedAt: "desc" }],
    take: 200,
  });

  const handedIn = await prisma.schoolAssignmentSubmission.findMany({
    where: {
      companyId: input.companyId,
      studentId: input.student.id,
      assignmentId: { in: assignments.map((row) => row.id) },
    },
    select: { assignmentId: true },
  });
  const mine = new Set(handedIn.map((row) => row.assignmentId));

  const outstanding = assignments
    .filter((row) => !mine.has(row.id))
    .map((row) => ({
      id: row.id,
      title: row.title,
      subjectName: row.classSubject.subject.name,
      dueInDays: row.dueAt
        ? Math.ceil((row.dueAt.getTime() - input.at.getTime()) / DAY_MS)
        : null,
      isOverdue: row.dueAt !== null && row.dueAt.getTime() < input.at.getTime(),
    }));

  return {
    due: outstanding.length,
    overdue: outstanding.filter((row) => row.isOverdue).length,
    soon: outstanding.slice(0, DUE_SOON_SHOWN),
  };
}
