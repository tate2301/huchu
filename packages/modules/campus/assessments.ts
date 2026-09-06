import type { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import {
  computeTermMark,
  DEFAULT_GRADING_BANDS,
  type GradingBand,
  type ScoredAssessment,
  type TermMark,
} from "./grading";

export {
  computeTermMark,
  DEFAULT_GRADING_BANDS,
  findBandProblems,
  gradeFor,
  type GradingBand,
  type ScoredAssessment,
  type TermMark,
} from "./grading";

const toNumber = (value: Prisma.Decimal | number | null) =>
  value === null ? null : Number(value);

export type ResolvedScheme = {
  id: string;
  code: string;
  name: string;
  continuousWeight: number;
  examWeight: number;
  passMark: number;
  bands: GradingBand[];
};

/**
 * The scheme a mark is graded against.
 *
 * Named explicitly, or the school's default, or — for a school that has not
 * set one up — the built-in table. The fallback is what stops "no grading
 * scheme" from being an error a teacher sees while trying to enter marks; the
 * grades it produces are the same ones provisioning would have created.
 */
export async function resolveGradingScheme(
  companyId: string,
  schemeId?: string | null,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ResolvedScheme> {
  const scheme = await db.schoolGradingScheme.findFirst({
    where: schemeId
      ? { id: schemeId, companyId }
      : { companyId, isDefault: true, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      continuousWeight: true,
      examWeight: true,
      passMark: true,
      bands: {
        select: {
          grade: true,
          minScore: true,
          maxScore: true,
          points: true,
          remark: true,
        },
        orderBy: { minScore: "desc" },
      },
    },
  });

  if (!scheme) {
    return {
      id: "",
      code: "DEFAULT",
      name: "Standard scheme",
      continuousWeight: 30,
      examWeight: 70,
      passMark: 50,
      bands: DEFAULT_GRADING_BANDS,
    };
  }

  return {
    id: scheme.id,
    code: scheme.code,
    name: scheme.name,
    continuousWeight: Number(scheme.continuousWeight),
    examWeight: Number(scheme.examWeight),
    passMark: Number(scheme.passMark),
    bands: scheme.bands.length
      ? scheme.bands.map((band) => ({
          grade: band.grade,
          minScore: Number(band.minScore),
          maxScore: Number(band.maxScore),
          points: band.points,
          remark: band.remark,
        }))
      : DEFAULT_GRADING_BANDS,
  };
}

export class AssessmentLockedError extends Error {
  constructor() {
    super("This assessment is locked. Reopen it before changing marks.");
    this.name = "AssessmentLockedError";
  }
}

export class ScoreOutOfRangeError extends Error {
  constructor(score: number, maxScore: number) {
    super(`${score} is more than the ${maxScore} marks available`);
    this.name = "ScoreOutOfRangeError";
  }
}

export type ScoreInput = {
  studentId: string;
  score: number | null;
  isAbsent?: boolean;
  comment?: string | null;
};

/**
 * Enter or change a page of marks in one go.
 *
 * One call for the whole class rather than one per child: a teacher marking
 * thirty scripts saves once, and thirty separate writes turn a lost connection
 * into a half-entered mark sheet nobody can tell from a half-marked one.
 *
 * A score above the paper's total is refused rather than clamped. It is almost
 * always a typo — 75 into a test out of 20 — and silently storing 20 would put
 * a wrong mark on a report with nothing to show it had been changed.
 */
export async function saveAssessmentScores(input: {
  companyId: string;
  assessmentId: string;
  scores: ScoreInput[];
  markedById?: string | null;
}) {
  const assessment = await prisma.schoolAssessment.findFirst({
    where: { id: input.assessmentId, companyId: input.companyId },
    select: { id: true, maxScore: true, status: true },
  });
  if (!assessment) throw new Error("Assessment not found");
  if (assessment.status === "LOCKED") throw new AssessmentLockedError();

  const maxScore = Number(assessment.maxScore);
  for (const entry of input.scores) {
    if (entry.score !== null && entry.score > maxScore) {
      throw new ScoreOutOfRangeError(entry.score, maxScore);
    }
    if (entry.score !== null && entry.score < 0) {
      throw new ScoreOutOfRangeError(entry.score, maxScore);
    }
  }

  return prisma.$transaction(
    input.scores.map((entry) => {
      // Absent wins over a score. The check constraint refuses a row that
      // carries both, and a caller sending both means the child was marked
      // absent after the mark was typed.
      const isAbsent = entry.isAbsent === true;
      const score = isAbsent ? null : entry.score;
      return prisma.schoolAssessmentScore.upsert({
        where: {
          companyId_assessmentId_studentId: {
            companyId: input.companyId,
            assessmentId: input.assessmentId,
            studentId: entry.studentId,
          },
        },
        create: {
          companyId: input.companyId,
          assessmentId: input.assessmentId,
          studentId: entry.studentId,
          score,
          isAbsent,
          comment: entry.comment ?? null,
          markedById: input.markedById ?? null,
        },
        update: {
          score,
          isAbsent,
          comment: entry.comment ?? null,
          markedById: input.markedById ?? null,
        },
      });
    }),
  );
}

export type StudentSubjectMark = {
  studentId: string;
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  classSubjectId: string;
  subject: { id: string; code: string; name: string };
} & TermMark;

/**
 * Every term mark for one class, subject by subject and child by child.
 *
 * Reads the assessments and their scores in two queries rather than per
 * student, because a class of forty over ten subjects is four hundred marks and
 * the obvious loop is four hundred round trips.
 */
export async function computeClassTermMarks(input: {
  companyId: string;
  termId: string;
  classId: string;
  streamId?: string | null;
  /** Narrow to one subject — the secondary-school teacher's view. */
  classSubjectId?: string;
  schemeId?: string | null;
}): Promise<{ scheme: ResolvedScheme; marks: StudentSubjectMark[] }> {
  const scheme = await resolveGradingScheme(input.companyId, input.schemeId);

  const assessments = await prisma.schoolAssessment.findMany({
    where: {
      companyId: input.companyId,
      termId: input.termId,
      classSubject: {
        classId: input.classId,
        ...(input.streamId ? { streamId: input.streamId } : {}),
        ...(input.classSubjectId ? { id: input.classSubjectId } : {}),
      },
    },
    select: {
      id: true,
      kind: true,
      maxScore: true,
      weight: true,
      classSubjectId: true,
      classSubject: {
        select: { subject: { select: { id: true, code: true, name: true } } },
      },
      scores: {
        select: { studentId: true, score: true, isAbsent: true },
      },
    },
  });

  // studentId -> classSubjectId -> the assessments they have a mark in.
  const byStudent = new Map<string, Map<string, ScoredAssessment[]>>();
  const subjectOf = new Map<string, { id: string; code: string; name: string }>();

  for (const assessment of assessments) {
    subjectOf.set(assessment.classSubjectId, assessment.classSubject.subject);
    for (const score of assessment.scores) {
      let subjects = byStudent.get(score.studentId);
      if (!subjects) {
        subjects = new Map();
        byStudent.set(score.studentId, subjects);
      }
      const bucket = subjects.get(assessment.classSubjectId) ?? [];
      bucket.push({
        kind: assessment.kind,
        maxScore: Number(assessment.maxScore),
        weight: Number(assessment.weight),
        score: score.isAbsent ? null : toNumber(score.score),
      });
      subjects.set(assessment.classSubjectId, bucket);
    }
  }

  // Names in one query rather than one per row: a class of forty over ten
  // subjects is four hundred rows and the same forty children.
  const students = await prisma.schoolStudent.findMany({
    where: { companyId: input.companyId, id: { in: [...byStudent.keys()] } },
    select: { id: true, studentNo: true, firstName: true, lastName: true },
  });
  const studentOf = new Map(students.map((student) => [student.id, student]));

  const marks: StudentSubjectMark[] = [];
  for (const [studentId, subjects] of byStudent) {
    const student = studentOf.get(studentId);
    if (!student) continue;
    for (const [classSubjectId, entries] of subjects) {
      const subject = subjectOf.get(classSubjectId);
      if (!subject) continue;
      marks.push({
        studentId,
        student,
        classSubjectId,
        subject,
        ...computeTermMark(entries, scheme),
      });
    }
  }

  // Surname then subject: a term-mark list is read child by child, and the
  // report card it becomes is printed the same way.
  marks.sort(
    (a, b) =>
      a.student.lastName.localeCompare(b.student.lastName) ||
      a.student.firstName.localeCompare(b.student.firstName) ||
      a.subject.name.localeCompare(b.subject.name),
  );

  return { scheme, marks };
}

/**
 * Write the computed term marks onto a result sheet.
 *
 * The sheet is the thing the school moderates and publishes, and it already
 * existed — with hand-typed scores and hand-typed grades under it. This makes
 * it derived: run the roll-up and the sheet says what the marks say.
 *
 * Refused once the sheet has left DRAFT. A roll-up over a submitted sheet would
 * silently change numbers a head of department has already signed off, and the
 * moderation trail would show an approval of figures that are no longer there.
 */
export async function rollUpTermMarks(input: {
  companyId: string;
  termId: string;
  classId: string;
  streamId?: string | null;
  title?: string;
  schemeId?: string | null;
}) {
  const { scheme, marks } = await computeClassTermMarks(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.schoolResultSheet.findFirst({
      where: {
        companyId: input.companyId,
        termId: input.termId,
        classId: input.classId,
        streamId: input.streamId ?? null,
      },
      select: { id: true, status: true },
    });

    if (existing && existing.status !== "DRAFT") {
      throw new Error(
        "This result sheet has been submitted. Reopen it before rolling marks up again.",
      );
    }

    const sheet =
      existing ??
      (await tx.schoolResultSheet.create({
        data: {
          companyId: input.companyId,
          termId: input.termId,
          classId: input.classId,
          streamId: input.streamId ?? null,
          title: input.title ?? "Term marks",
        },
        select: { id: true, status: true },
      }));

    // Replace rather than merge. A subject dropped from the timetable leaves a
    // line behind otherwise, and a report card with a subject nobody teaches on
    // it is worse than one that is a rebuild away from correct.
    await tx.schoolResultLine.deleteMany({
      where: { companyId: input.companyId, sheetId: sheet.id },
    });

    const written = marks.filter((mark) => mark.mark !== null);
    if (written.length > 0) {
      await tx.schoolResultLine.createMany({
        data: written.map((mark) => ({
          companyId: input.companyId,
          sheetId: sheet.id,
          studentId: mark.studentId,
          subjectCode: mark.subject.code,
          score: mark.mark as number,
          grade: mark.grade?.grade ?? null,
          remarks: mark.caveat,
        })),
      });
    }

    return {
      sheetId: sheet.id,
      linesWritten: written.length,
      skipped: marks.length - written.length,
      scheme: { id: scheme.id, name: scheme.name },
    };
  });
}
