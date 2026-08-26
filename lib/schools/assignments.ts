import { prisma } from "@/lib/prisma";

/**
 * Homework: what was set, and what came back.
 *
 * The screens are built from the class roll outward, not from the submissions,
 * because "not handed in" is the absence of a row and a list of submissions
 * cannot show you an absence. That is the only thing a teacher opens this for
 * on a Tuesday evening.
 */

export class AssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentError";
  }
}

export type SubmissionStatus = "SUBMITTED" | "LATE" | "RETURNED" | "RESUBMIT";

export const SUBMISSION_LABELS: Record<SubmissionStatus, string> = {
  SUBMITTED: "In",
  LATE: "In late",
  RETURNED: "Marked",
  RESUBMIT: "Do it again",
};

/**
 * Whether a submission is late.
 *
 * Lateness is decided once, when the work arrives, and stored — not computed
 * every time the row is read. Otherwise a teacher who extends a deadline turns
 * yesterday's late submissions into on-time ones and the record of what
 * actually happened is gone.
 */
export function lateness(dueAt: Date | null, submittedAt: Date): SubmissionStatus {
  if (!dueAt) return "SUBMITTED";
  return submittedAt.getTime() > dueAt.getTime() ? "LATE" : "SUBMITTED";
}

/**
 * Publish a piece of homework to the class.
 *
 * A separate act from creating it, because a teacher drafts on a Sunday and
 * does not want thirty children reading a half-written instruction. The
 * database refuses `isPublished` without a date and vice versa, so this is the
 * only place either is set.
 */
export async function publishAssignment(input: {
  companyId: string;
  assignmentId: string;
  publish: boolean;
}) {
  const assignment = await prisma.schoolAssignment.findFirst({
    where: { id: input.assignmentId, companyId: input.companyId },
    select: { id: true, isPublished: true, _count: { select: { submissions: true } } },
  });
  if (!assignment) throw new AssignmentError("Assignment not found");

  if (!input.publish && assignment._count.submissions > 0) {
    throw new AssignmentError(
      `${assignment._count.submissions} ${assignment._count.submissions === 1 ? "child has" : "children have"} already handed this in — unpublishing would hide work they can see`,
    );
  }

  return prisma.schoolAssignment.update({
    where: { id: assignment.id },
    data: {
      isPublished: input.publish,
      publishedAt: input.publish ? new Date() : null,
    },
    select: { id: true, isPublished: true, publishedAt: true },
  });
}

/**
 * A child hands work in.
 *
 * Upsert, because a child editing what they wrote before the deadline is
 * ordinary and a second row would give the teacher two answers. Late work is
 * recorded as late rather than refused — a school still wants the work, and
 * lateness is a fact about it, not a reason to lose it.
 */
export async function submitAssignment(input: {
  companyId: string;
  assignmentId: string;
  studentId: string;
  content?: string | null;
  attachmentUrl?: string | null;
  at?: Date;
}) {
  const assignment = await prisma.schoolAssignment.findFirst({
    where: { id: input.assignmentId, companyId: input.companyId },
    select: { id: true, dueAt: true, isPublished: true },
  });
  if (!assignment) throw new AssignmentError("Assignment not found");
  if (!assignment.isPublished) {
    throw new AssignmentError("That homework has not been set yet");
  }

  const submittedAt = input.at ?? new Date();
  const status = lateness(assignment.dueAt, submittedAt);

  return prisma.schoolAssignmentSubmission.upsert({
    where: {
      companyId_assignmentId_studentId: {
        companyId: input.companyId,
        assignmentId: assignment.id,
        studentId: input.studentId,
      },
    },
    create: {
      companyId: input.companyId,
      assignmentId: assignment.id,
      studentId: input.studentId,
      status,
      submittedAt,
      content: input.content ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
    },
    // A resubmission keeps its original lateness. Re-deciding it here would let
    // a child who handed in late edit their answer the next day and become
    // on time.
    update: {
      content: input.content ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
    },
    select: { id: true, status: true, submittedAt: true },
  });
}

/**
 * Mark one submission and hand it back.
 *
 * The marker and the time travel together — the database refuses one without
 * the other — because a mark nobody's name is against cannot be queried by a
 * parent, and a marker with no mark is a half-finished action that reads as
 * finished.
 */
export async function markSubmission(input: {
  companyId: string;
  submissionId: string;
  score?: number | null;
  feedback?: string | null;
  markedById: string;
  sendBack?: boolean;
}) {
  const submission = await prisma.schoolAssignmentSubmission.findFirst({
    where: { id: input.submissionId, companyId: input.companyId },
    select: { id: true, assignment: { select: { maxScore: true, title: true } } },
  });
  if (!submission) throw new AssignmentError("Submission not found");

  const maxScore = submission.assignment.maxScore
    ? Number(submission.assignment.maxScore)
    : null;
  if (input.score != null && maxScore === null) {
    throw new AssignmentError(
      `"${submission.assignment.title}" is not marked out of anything — set a total on the homework first`,
    );
  }
  if (input.score != null && maxScore !== null && input.score > maxScore) {
    throw new AssignmentError(`${input.score} is more than the ${maxScore} available`);
  }

  return prisma.schoolAssignmentSubmission.update({
    where: { id: submission.id },
    data: {
      score: input.score ?? null,
      feedback: input.feedback ?? null,
      markedById: input.markedById,
      markedAt: new Date(),
      status: input.sendBack ? "RESUBMIT" : "RETURNED",
    },
    select: { id: true, status: true, score: true },
  });
}

export type AssignmentBoardRow = {
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  submission: {
    id: string;
    status: SubmissionStatus;
    submittedAt: Date;
    score: number | null;
    feedback: string | null;
  } | null;
};

/**
 * Who has handed in and who has not.
 *
 * Built from the class roll, so a child who has done nothing is a row saying
 * "not in" rather than an absence. A list of submissions answers the question
 * nobody asks.
 */
export async function assignmentBoard(input: {
  companyId: string;
  assignmentId: string;
}) {
  const assignment = await prisma.schoolAssignment.findFirst({
    where: { id: input.assignmentId, companyId: input.companyId },
    select: {
      id: true,
      title: true,
      instructions: true,
      dueAt: true,
      maxScore: true,
      isPublished: true,
      classSubject: {
        select: {
          id: true,
          classId: true,
          streamId: true,
          teacherProfileId: true,
          subject: { select: { id: true, code: true, name: true } },
          class: { select: { id: true, code: true, name: true } },
          stream: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!assignment) throw new AssignmentError("Assignment not found");

  const [students, submissions] = await Promise.all([
    prisma.schoolStudent.findMany({
      where: {
        companyId: input.companyId,
        status: "ACTIVE",
        currentClassId: assignment.classSubject.classId,
        ...(assignment.classSubject.streamId
          ? { currentStreamId: assignment.classSubject.streamId }
          : {}),
      },
      select: { id: true, studentNo: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.schoolAssignmentSubmission.findMany({
      where: { companyId: input.companyId, assignmentId: assignment.id },
      select: {
        id: true,
        studentId: true,
        status: true,
        submittedAt: true,
        score: true,
        feedback: true,
      },
    }),
  ]);

  const byStudent = new Map(submissions.map((row) => [row.studentId, row]));

  const rows: AssignmentBoardRow[] = students.map((student) => {
    const submission = byStudent.get(student.id);
    return {
      student,
      submission: submission
        ? {
            id: submission.id,
            status: submission.status as SubmissionStatus,
            submittedAt: submission.submittedAt,
            score: submission.score === null ? null : Number(submission.score),
            feedback: submission.feedback,
          }
        : null,
    };
  });

  return {
    assignment,
    rows,
    summary: {
      total: rows.length,
      in: rows.filter((row) => row.submission !== null).length,
      late: rows.filter((row) => row.submission?.status === "LATE").length,
      marked: rows.filter((row) => row.submission?.status === "RETURNED").length,
    },
  };
}

/** Where one piece of homework stands, from the office's point of view. */
export type AssignmentState = "DRAFT" | "SET" | "DUE_WEEK" | "OVERDUE";

export type AssignmentOversightRow = {
  id: string;
  title: string;
  dueAt: Date | null;
  setOn: Date;
  isPublished: boolean;
  classSubjectId: string;
  classId: string;
  className: string;
  streamName: string | null;
  subjectId: string;
  subjectName: string;
  /** The id, so the board's Teacher filter is not matching on a name. */
  teacherProfileId: string;
  teacherName: string | null;
  /** Everybody the work was set to, handed in or not. */
  onRoll: number;
  handedIn: number;
  late: number;
  marked: number;
  state: AssignmentState;
};

/** Monday 00:00 of the week containing `now`, in UTC. */
function weekStart(now: Date) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = start.getUTCDay();
  // Sunday is 0 and a school week starts on Monday.
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  return start;
}

/**
 * Every piece of homework in the term, across every class, with what came back.
 *
 * `/api/v2/schools/assignments` counts submissions; the teacher portal counts
 * them against one teacher's roll. Neither answers the head's question, which
 * is asked about the whole school at once: what has been set, what is due, and
 * which class is drowning. "Nobody handed this in" and "nobody is in the class"
 * are the same zero in a submission count, so the roll travels with every row —
 * that is the number that makes 4 of 32 read differently from 4 of 5.
 *
 * State is derived here rather than stored, because it is a fact about today,
 * not about the homework: yesterday's "due this week" is today's "overdue"
 * without anybody editing anything.
 */
export async function assignmentOversight(input: {
  companyId: string;
  termId: string;
  classId?: string;
  subjectId?: string;
  teacherProfileId?: string;
  /** Injectable so the tests are not hostage to the day they run on. */
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const from = weekStart(now);
  const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

  const assignments = await prisma.schoolAssignment.findMany({
    where: {
      companyId: input.companyId,
      termId: input.termId,
      classSubject: {
        ...(input.classId ? { classId: input.classId } : {}),
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        ...(input.teacherProfileId
          ? { teacherProfileId: input.teacherProfileId }
          : {}),
      },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      createdAt: true,
      isPublished: true,
      classSubjectId: true,
      classSubject: {
        select: {
          classId: true,
          streamId: true,
          class: { select: { id: true, name: true, level: true } },
          stream: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          teacherProfile: {
            select: { id: true, user: { select: { name: true } } },
          },
        },
      },
    },
    // Soonest deadline first: the question is "what is due". Postgres sorts
    // nulls last on ascending, so reading set over the holidays sits at the
    // bottom where it belongs.
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  if (assignments.length === 0) {
    return {
      rows: [] as AssignmentOversightRow[],
      summary: { open: 0, dueThisWeek: 0, overdue: 0, onRoll: 0, handedIn: 0 },
      week: { from, to },
    };
  }

  const [counts, sizes] = await Promise.all([
    prisma.schoolAssignmentSubmission.groupBy({
      by: ["assignmentId", "status"],
      where: {
        companyId: input.companyId,
        assignmentId: { in: assignments.map((row) => row.id) },
      },
      _count: { _all: true },
    }),
    prisma.schoolStudent.groupBy({
      by: ["currentClassId", "currentStreamId"],
      where: {
        companyId: input.companyId,
        status: "ACTIVE",
        currentClassId: {
          in: [...new Set(assignments.map((row) => row.classSubject.classId))],
        },
      },
      _count: { _all: true },
    }),
  ]);

  // A subject taught to a whole form counts the form; taught to one stream, it
  // counts that stream. Same rule as the register and the teacher's rail, so
  // three screens cannot disagree about how many children are in Form 2A.
  const rollFor = (classId: string, streamId: string | null) =>
    streamId
      ? (sizes.find(
          (row) => row.currentClassId === classId && row.currentStreamId === streamId,
        )?._count._all ?? 0)
      : sizes
          .filter((row) => row.currentClassId === classId)
          .reduce((total, row) => total + row._count._all, 0);

  const rows: AssignmentOversightRow[] = assignments.map((assignment) => {
    const mine = counts.filter((row) => row.assignmentId === assignment.id);
    const handedIn = mine.reduce((total, row) => total + row._count._all, 0);
    const countOf = (status: SubmissionStatus) =>
      mine.find((row) => row.status === status)?._count._all ?? 0;
    const onRoll = rollFor(
      assignment.classSubject.classId,
      assignment.classSubject.streamId,
    );

    const due = assignment.dueAt;
    let state: AssignmentState;
    if (!assignment.isPublished) {
      // A draft has not been set. Counting it as open would tell a head the
      // class has work it cannot see.
      state = "DRAFT";
    } else if (due && due.getTime() < now.getTime() && handedIn < onRoll) {
      // Overdue means the deadline has passed *and* work is still missing.
      // A class that all handed in on Friday is finished, not in trouble.
      state = "OVERDUE";
    } else if (due && due.getTime() >= from.getTime() && due.getTime() < to.getTime()) {
      state = "DUE_WEEK";
    } else {
      state = "SET";
    }

    return {
      id: assignment.id,
      title: assignment.title,
      dueAt: assignment.dueAt,
      setOn: assignment.createdAt,
      isPublished: assignment.isPublished,
      classSubjectId: assignment.classSubjectId,
      classId: assignment.classSubject.class.id,
      className: assignment.classSubject.class.name,
      streamName: assignment.classSubject.stream?.name ?? null,
      subjectId: assignment.classSubject.subject.id,
      subjectName: assignment.classSubject.subject.name,
      teacherProfileId: assignment.classSubject.teacherProfile.id,
      teacherName: assignment.classSubject.teacherProfile.user.name,
      onRoll,
      handedIn,
      late: countOf("LATE"),
      // `RETURNED` only, matching `assignmentBoard`: work sent back to be done
      // again has been read, but it is not finished with.
      marked: countOf("RETURNED"),
      state,
    };
  });

  const published = rows.filter((row) => row.state !== "DRAFT");

  return {
    rows,
    summary: {
      /** Set and not yet past its deadline — the work currently running. */
      open: published.filter((row) => row.state !== "OVERDUE").length,
      dueThisWeek: published.filter(
        (row) =>
          row.dueAt !== null &&
          row.dueAt.getTime() >= from.getTime() &&
          row.dueAt.getTime() < to.getTime(),
      ).length,
      overdue: published.filter((row) => row.state === "OVERDUE").length,
      onRoll: published.reduce((total, row) => total + row.onRoll, 0),
      handedIn: published.reduce((total, row) => total + row.handedIn, 0),
    },
    week: { from, to },
  };
}
