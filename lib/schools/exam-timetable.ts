import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ExamError } from "@/lib/schools/exams";

/**
 * The exam timetable: which papers this series sits, and when.
 *
 * ## Why this had to exist
 *
 * `SchoolExamSession`, `SchoolExamPaper` and `SchoolExamAccessArrangement`
 * shipped with the exams expansion, are read by `seatingPlan()` and drawn by
 * the Seating tab — and nothing in the product could create a row in any of
 * them. Production code only ever read them; the sole `create` in the repository
 * was in a migration witness test. So the seating screen was a finished
 * interface onto three empty tables: every school opened it to "no sittings
 * yet" and had no way anywhere to add one.
 *
 * A school does not invent this timetable. ZIMSEC and Cambridge publish theirs
 * months ahead and the school copies the rows for the subjects it has entered —
 * `4008/1, Tuesday 3 November, 09:00, 2h30`. So the shape here is transcription,
 * not planning: a subject, a paper number, a date and a length.
 *
 * ## A paper and its sitting are written together
 *
 * `SchoolExamPaper` carries the syllabus identity (`4008/1`) and
 * `SchoolExamSession` carries the sitting that seating is planned against. They
 * are one act for the office — writing down that paper 1 sits on Tuesday
 * morning — so `addPaper` writes both in a transaction. A paper with a date and
 * no session would be a row that looks scheduled and cannot be seated, which is
 * the state this module exists to end.
 */

/**
 * What a school calls each level out loud.
 *
 * Declared here rather than imported from `exams-v2.ts`, which is the client
 * module and pulls `fetchJson` in with it. The same three words, and they
 * belong to the domain rather than to the browser.
 */
const LEVEL_LABELS: Record<string, string> = {
  O_LEVEL: "Ordinary Level",
  A_LEVEL: "Advanced Level",
  IGCSE: "IGCSE",
};

export type TimetablePaper = {
  id: string;
  paperNumber: number;
  code: string;
  sitsAt: Date | null;
  durationMinutes: number | null;
  subject: { id: string; code: string; name: string };
  session: { id: string; startsAt: Date; endsAt: Date | null; seated: number } | null;
};

/** Every paper in the series, in the order it sits. */
export async function listTimetable(args: {
  companyId: string;
  seriesId: string;
}): Promise<TimetablePaper[]> {
  const papers = await prisma.schoolExamPaper.findMany({
    where: { companyId: args.companyId, seriesId: args.seriesId },
    select: {
      id: true,
      paperNumber: true,
      code: true,
      sitsAt: true,
      durationMinutes: true,
      examSubject: { select: { id: true, code: true, name: true } },
      sessions: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          _count: { select: { seats: true } },
        },
        orderBy: { startsAt: "asc" },
        take: 1,
      },
    },
    // Undated papers last: a timetable half-copied is read top to bottom, and
    // the rows still to be filled in belong at the bottom of it.
    orderBy: [{ sitsAt: { sort: "asc", nulls: "last" } }, { code: "asc" }],
  });

  return papers.map((paper) => {
    const session = paper.sessions[0];
    return {
      id: paper.id,
      paperNumber: paper.paperNumber,
      code: paper.code,
      sitsAt: paper.sitsAt,
      durationMinutes: paper.durationMinutes,
      subject: paper.examSubject,
      session: session
        ? {
            id: session.id,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            seated: session._count.seats,
          }
        : null,
    };
  });
}

/**
 * Resolve the subject against this series, and refuse anything that is not on it.
 *
 * Both halves matter. The company check is the tenant boundary — an
 * `examSubjectId` arrives in a request body and, unchecked, one school writes a
 * paper against another school's syllabus row. The board and level check is the
 * domain one: a Cambridge IGCSE subject on a ZIMSEC O-Level series is a row the
 * board will reject, and finding that out in November is finding out too late.
 */
async function subjectOnSeries(args: {
  companyId: string;
  seriesId: string;
  examSubjectId: string;
}) {
  const [series, subject] = await Promise.all([
    prisma.schoolExamSeries.findFirst({
      where: { id: args.seriesId, companyId: args.companyId },
      select: { id: true, boardId: true, level: true, status: true },
    }),
    prisma.schoolExamSubject.findFirst({
      where: { id: args.examSubjectId, companyId: args.companyId },
      select: { id: true, boardId: true, level: true, code: true, name: true },
    }),
  ]);

  if (!series) throw new ExamError("That series is not this school's.", 404);
  if (!subject) throw new ExamError("That is not one of this school's exam subjects.", 404);
  if (subject.boardId !== series.boardId) {
    throw new ExamError("That subject belongs to a different exam board.", 422);
  }
  if (subject.level !== series.level) {
    // Name both levels. "That subject is a different level" sends somebody
    // back to a list of forty to work out which one, and a mechanical
    // `A_LEVEL -> "a level"` is worse than saying nothing.
    throw new ExamError(
      `That subject is ${LEVEL_LABELS[subject.level]}, and this series is ${LEVEL_LABELS[series.level]}.`,
      422,
    );
  }

  return { series, subject };
}

/**
 * Write down one paper and when it sits.
 *
 * `code` is not derived. `4008/1` is the usual shape and it is what this
 * defaults to, but boards do not all spell it that way and the code is the
 * thing an invigilator reads off the question paper to check they have the
 * right pile — so a school can correct it.
 */
export async function addPaper(args: {
  companyId: string;
  seriesId: string;
  examSubjectId: string;
  paperNumber: number;
  code?: string | null;
  sitsAt: Date;
  durationMinutes?: number | null;
}): Promise<TimetablePaper> {
  const { subject } = await subjectOnSeries(args);

  const code = args.code?.trim() || `${subject.code}/${args.paperNumber}`;
  const endsAt = args.durationMinutes
    ? new Date(args.sitsAt.getTime() + args.durationMinutes * 60_000)
    : null;

  try {
    const paper = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolExamPaper.create({
        data: {
          companyId: args.companyId,
          seriesId: args.seriesId,
          examSubjectId: args.examSubjectId,
          paperNumber: args.paperNumber,
          code,
          sitsAt: args.sitsAt,
          durationMinutes: args.durationMinutes ?? null,
        },
        select: { id: true },
      });

      await tx.schoolExamSession.create({
        data: {
          companyId: args.companyId,
          seriesId: args.seriesId,
          paperId: created.id,
          startsAt: args.sitsAt,
          endsAt,
          label: `${subject.name} ${code}`,
        },
      });

      return created;
    });

    const rows = await listTimetable({ companyId: args.companyId, seriesId: args.seriesId });
    const row = rows.find((candidate) => candidate.id === paper.id);
    if (!row) throw new ExamError("The paper was written but could not be read back.", 500);
    return row;
  } catch (error) {
    // @@unique([seriesId, examSubjectId, paperNumber]). A school copying a
    // timetable will type paper 1 twice; that is a correction to make, not a
    // 500 to stare at.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ExamError(
        `${subject.name} paper ${args.paperNumber} is already on this timetable.`,
        409,
      );
    }
    throw error;
  }
}

/**
 * Move a paper, and move its sitting with it.
 *
 * Boards reschedule, and a paper whose date changed while its session stayed
 * put would seat a hall on the wrong morning — the two dates are one fact
 * stored twice, so they are written together or not at all.
 */
export async function reschedulePaper(args: {
  companyId: string;
  paperId: string;
  sitsAt: Date;
  durationMinutes?: number | null;
}): Promise<void> {
  const paper = await prisma.schoolExamPaper.findFirst({
    where: { id: args.paperId, companyId: args.companyId },
    select: { id: true, durationMinutes: true },
  });
  if (!paper) throw new ExamError("That paper is not this school's.", 404);

  const duration =
    args.durationMinutes === undefined ? paper.durationMinutes : args.durationMinutes;
  const endsAt = duration ? new Date(args.sitsAt.getTime() + duration * 60_000) : null;

  await prisma.$transaction([
    prisma.schoolExamPaper.update({
      where: { id: paper.id },
      data: { sitsAt: args.sitsAt, durationMinutes: duration },
    }),
    prisma.schoolExamSession.updateMany({
      where: { companyId: args.companyId, paperId: paper.id },
      data: { startsAt: args.sitsAt, endsAt },
    }),
  ]);
}

/**
 * Take a paper off the timetable.
 *
 * Refused once anybody is seated for it. A seating plan is printed, pinned up
 * and handed to invigilators, and deleting the sitting under it would leave a
 * hall of candidates with desk cards for a paper the system says is not
 * happening. Unseat them first, deliberately.
 */
export async function removePaper(args: {
  companyId: string;
  paperId: string;
}): Promise<void> {
  const paper = await prisma.schoolExamPaper.findFirst({
    where: { id: args.paperId, companyId: args.companyId },
    select: { id: true, sessions: { select: { _count: { select: { seats: true } } } } },
  });
  if (!paper) throw new ExamError("That paper is not this school's.", 404);

  const seated = paper.sessions.reduce((total, session) => total + session._count.seats, 0);
  if (seated > 0) {
    throw new ExamError(
      `${seated} candidate${seated === 1 ? " is" : "s are"} seated for this paper. Clear the seating first.`,
      409,
    );
  }

  // The session goes with it: `SchoolExamSession.paperId` is SetNull on delete,
  // which would leave a sitting on the seating screen belonging to no paper.
  await prisma.$transaction([
    prisma.schoolExamSession.deleteMany({
      where: { companyId: args.companyId, paperId: paper.id },
    }),
    prisma.schoolExamPaper.delete({ where: { id: paper.id } }),
  ]);
}
