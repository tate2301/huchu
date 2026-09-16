import { Prisma, type SchoolExamLevel } from "@prisma/client";

import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { bandFor, gradeRank, isPass, SUBJECT_RULE } from "@/lib/schools/exam-grades";

/**
 * Public exams — S-13.1 and S-13.2.
 *
 * Not the internal assessment this module already has. `SchoolResultSheet` is a
 * term's marks against a class; a series is neither a term nor a class, and a
 * public exam result is a grade with no score where a `SchoolResultLine` is a
 * required score with an optional grade.
 *
 * **Submission to the board is manual and stays manual.** `SCH-DEP-02` defers
 * the exam authority's API pending external dependency and policy review, and
 * the expansion plan re-confirms it. `buildEntryFile` produces a file and
 * records that it was produced; nothing here may grow a board integration, and
 * `SchoolExamEntryFileRun` is not a submission receipt.
 *
 * The deadline is the argument. A missed ZIMSEC entry deadline costs a pupil a
 * year — there is no appeal and no late door after the late door — which is why
 * `daysToDeadline` is the first thing the index computes and the first chip it
 * draws.
 */

export class ExamError extends Error {
  /**
   * What the caller did wrong, as a status.
   *
   * 422 by default, which is what every existing throw means: the request was
   * understood and the school's rules refuse it. The timetable needs the other
   * two — 404 for a series or paper that is not this school's, 409 for a paper
   * already on the timetable or a sitting somebody is already seated for — and
   * collapsing those into 422 tells the screen that a duplicate and a
   * cross-tenant id are the same kind of problem.
   */
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "ExamError";
    this.status = status;
  }
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from `now` to `date`. Negative once the date has passed.
 *
 * `Math.ceil` of a small negative is `-0`, which prints as "0" and sorts equal
 * to zero — so for the first 24 hours after an entry deadline passed, the board
 * read "0 days" and the missed series still sorted as the most urgent thing on
 * the screen. `|| 0` would keep the sign problem; flooring the negative side
 * gives a deadline that went yesterday the -1 it should have.
 */
export function daysAway(date: Date | null | undefined, now: number): number | null {
  if (!date) return null;
  const delta = date.getTime() - now;
  return delta < 0 ? Math.floor(delta / DAY) : Math.ceil(delta / DAY);
}

export type SeriesRow = {
  id: string;
  name: string;
  year: number;
  level: SchoolExamLevel;
  status: string;
  board: { id: string; code: string; name: string };
  centre: { id: string; number: string } | null;
  entriesCloseAt: Date | null;
  lateEntriesCloseAt: Date | null;
  candidates: number;
  entries: number;
  /** Entry fees invoiced, and how much of that has been settled. */
  invoiced: string;
  collected: string;
  /** True where the two are equal — the only conditional colour in the table. */
  settled: boolean;
};

/**
 * Every series, with the four numbers the index draws per row.
 *
 * Cambridge sits in the same table as ZIMSEC — not a separate screen, not a tab
 * — because the school runs both and the deadline that matters is whichever is
 * nearest.
 */
export async function listSeries(args: {
  companyId: string;
  boardId?: string;
  level?: SchoolExamLevel;
  status?: "open" | "results" | "all";
  search?: string;
}): Promise<SeriesRow[]> {
  const where: Prisma.SchoolExamSeriesWhereInput = { companyId: args.companyId };
  if (args.boardId) where.boardId = args.boardId;
  if (args.level) where.level = args.level;
  if (args.status === "open") where.status = { in: ["PLANNED", "ENTRIES_OPEN"] };
  if (args.status === "results") where.status = { in: ["RESULTS_IN", "SAT"] };
  if (args.search?.trim()) {
    const term = args.search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { centre: { number: { contains: term, mode: "insensitive" } } },
      { board: { name: { contains: term, mode: "insensitive" } } },
      { candidates: { some: { candidateNumber: { contains: term, mode: "insensitive" } } } },
    ];
  }

  const series = await prisma.schoolExamSeries.findMany({
    where,
    select: {
      id: true,
      name: true,
      year: true,
      level: true,
      status: true,
      entriesCloseAt: true,
      lateEntriesCloseAt: true,
      board: { select: { id: true, code: true, name: true } },
      centre: { select: { id: true, number: true } },
      _count: { select: { candidates: true, entries: true } },
      entries: {
        select: {
          fee: true,
          feeInvoice: { select: { totalAmount: true, paidAmount: true, balanceAmount: true } },
        },
      },
    },
    orderBy: [{ year: "desc" }, { name: "asc" }],
  });

  return series.map((row) => {
    // Invoiced is what went onto a bill; collected is what came back. A series
    // whose two figures differ is one that still owes the board money, which is
    // the one thing a bursar reads this table for.
    let invoiced = new Prisma.Decimal(0);
    let collected = new Prisma.Decimal(0);
    const seen = new Set<string>();
    for (const entry of row.entries) {
      if (!entry.feeInvoice) continue;
      invoiced = invoiced.plus(entry.fee ?? 0);
      // The paid share of an invoice counts once per invoice, not once per
      // entry on it.
      const key = `${entry.feeInvoice.totalAmount}-${entry.feeInvoice.paidAmount}`;
      if (!seen.has(key)) seen.add(key);
      collected = collected.plus(
        entry.feeInvoice.balanceAmount.lessThanOrEqualTo(0) ? (entry.fee ?? 0) : 0,
      );
    }
    return {
      id: row.id,
      name: row.name,
      year: row.year,
      level: row.level,
      status: row.status,
      board: row.board,
      centre: row.centre,
      entriesCloseAt: row.entriesCloseAt,
      lateEntriesCloseAt: row.lateEntriesCloseAt,
      candidates: row._count.candidates,
      entries: row._count.entries,
      invoiced: invoiced.toFixed(2),
      collected: collected.toFixed(2),
      settled: invoiced.equals(collected),
    };
  });
}

export type DeadlineRow = {
  deadline: string;
  date: Date | null;
  days: number | null;
  follows: string;
};

/**
 * The four dates that follow a series' entry close, and what each one costs.
 *
 * A table of dates, days and consequences rather than a paragraph each, because
 * the consequence is the part a deputy head is deciding on.
 */
export function deadlineRows(
  series: {
    entriesCloseAt: Date | null;
    lateEntriesCloseAt: Date | null;
    resultsDueOn: Date | null;
    lateFeePerSubject: Prisma.Decimal | null;
    currency: string;
  },
  now: number,
): DeadlineRow[] {
  const late = series.lateFeePerSubject
    ? `${series.currency === "USD" ? "$" : `${series.currency} `}${series.lateFeePerSubject.toFixed(2)} a subject on top`
    : "A penalty a subject on top";
  return [
    {
      deadline: "Entries close",
      date: series.entriesCloseAt,
      days: daysAway(series.entriesCloseAt, now),
      follows: "Late fee from this date",
    },
    {
      deadline: "Late entries, at a penalty",
      date: series.lateEntriesCloseAt,
      days: daysAway(series.lateEntriesCloseAt, now),
      follows: late,
    },
    {
      deadline: "Amendments and withdrawals close",
      date: series.lateEntriesCloseAt,
      days: daysAway(series.lateEntriesCloseAt, now),
      follows: "Withdrawals not refunded",
    },
    {
      deadline: "Results due",
      date: series.resultsDueOn,
      days: daysAway(series.resultsDueOn, now),
      follows: "Names checked against the roll",
    },
  ];
}

/**
 * What is stopping an entry, per candidate.
 *
 * Each of these is a NOT NULL requirement on the board's entry file, and each
 * is a row a school can act on today. The commonest is the last: the roll says
 * `Rufaro Gwatidzo` and the birth certificate says something else, and the board
 * prints what it is given.
 */
export type Blocker =
  | "No national ID or birth certificate"
  | "No date of birth"
  | "No sex recorded"
  | "No photograph"
  | "Name differs from the birth certificate"
  | "No candidate number";

export function blockersFor(candidate: {
  candidateNumber: string | null;
  certifiedName: string | null;
  student: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    gender: string | null;
    avatarUrl: string | null;
    nationalId: string | null;
    birthCertificateNo: string | null;
    certifiedName: string | null;
  };
}): Blocker[] {
  const blockers: Blocker[] = [];
  const student = candidate.student;
  if (!student.nationalId && !student.birthCertificateNo) {
    blockers.push("No national ID or birth certificate");
  }
  if (!student.dateOfBirth) blockers.push("No date of birth");
  if (!student.gender) blockers.push("No sex recorded");
  if (!student.avatarUrl) blockers.push("No photograph");
  const certified = candidate.certifiedName ?? student.certifiedName;
  const onTheRoll = `${student.firstName} ${student.lastName}`.trim().toLowerCase();
  if (certified && certified.trim().toLowerCase() !== onTheRoll) {
    blockers.push("Name differs from the birth certificate");
  }
  if (!candidate.candidateNumber) blockers.push("No candidate number");
  return blockers;
}

export type CandidateRow = {
  id: string;
  candidateNumber: string | null;
  certifiedName: string | null;
  status: string;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    gender: string | null;
    nationalId: string | null;
    birthCertificateNo: string | null;
    className: string | null;
    streamName: string | null;
  };
  subjects: number;
  /** The entry fee owed for this candidate, and whether it has been billed. */
  fees: { total: string; invoiced: boolean; paid: boolean };
  blockers: Blocker[];
};

export async function candidateRoll(args: {
  companyId: string;
  seriesId: string;
  classId?: string;
  status?: "all" | "ready" | "blocked" | "registered";
  search?: string;
}): Promise<CandidateRow[]> {
  const candidates = await prisma.schoolCandidate.findMany({
    where: {
      companyId: args.companyId,
      seriesId: args.seriesId,
      ...(args.classId ? { student: { currentClassId: args.classId } } : {}),
      ...(args.search?.trim()
        ? {
            OR: [
              { candidateNumber: { contains: args.search.trim(), mode: "insensitive" } },
              { student: { firstName: { contains: args.search.trim(), mode: "insensitive" } } },
              { student: { lastName: { contains: args.search.trim(), mode: "insensitive" } } },
              { student: { studentNo: { contains: args.search.trim(), mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      candidateNumber: true,
      certifiedName: true,
      status: true,
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          gender: true,
          avatarUrl: true,
          nationalId: true,
          birthCertificateNo: true,
          certifiedName: true,
          currentClass: { select: { name: true } },
          currentStream: { select: { name: true } },
        },
      },
      entries: {
        select: {
          fee: true,
          status: true,
          feeInvoiceId: true,
          feeInvoice: { select: { balanceAmount: true } },
        },
      },
    },
    orderBy: [{ candidateNumber: "asc" }, { student: { lastName: "asc" } }],
  });

  const rows = candidates.map((candidate) => {
    const live = candidate.entries.filter((entry) => entry.status !== "WITHDRAWN");
    const total = live.reduce(
      (sum, entry) => sum.plus(entry.fee ?? 0),
      new Prisma.Decimal(0),
    );
    const invoiced = live.length > 0 && live.every((entry) => entry.feeInvoiceId);
    const paid =
      invoiced &&
      live.every((entry) => entry.feeInvoice?.balanceAmount.lessThanOrEqualTo(0) ?? false);
    return {
      id: candidate.id,
      candidateNumber: candidate.candidateNumber,
      certifiedName: candidate.certifiedName,
      status: candidate.status,
      student: {
        id: candidate.student.id,
        studentNo: candidate.student.studentNo,
        firstName: candidate.student.firstName,
        lastName: candidate.student.lastName,
        dateOfBirth: candidate.student.dateOfBirth,
        gender: candidate.student.gender,
        nationalId: candidate.student.nationalId,
        birthCertificateNo: candidate.student.birthCertificateNo,
        className: candidate.student.currentClass?.name ?? null,
        streamName: candidate.student.currentStream?.name ?? null,
      },
      subjects: live.length,
      fees: { total: total.toFixed(2), invoiced, paid },
      blockers: blockersFor(candidate),
    };
  });

  if (args.status === "ready") return rows.filter((row) => row.blockers.length === 0 && row.status === "DRAFT");
  if (args.status === "blocked") return rows.filter((row) => row.blockers.length > 0);
  if (args.status === "registered") return rows.filter((row) => row.status === "ENTERED");
  return rows;
}

/** `What is stopping an entry` — the blockers, grouped, worst first. */
export function blockerSummary(rows: CandidateRow[]) {
  const counts = new Map<Blocker, string[]>();
  for (const row of rows) {
    for (const blocker of row.blockers) {
      const list = counts.get(blocker) ?? [];
      list.push(`${row.student.firstName} ${row.student.lastName}`);
      counts.set(blocker, list);
    }
  }
  return [...counts.entries()]
    .map(([blocker, candidates]) => ({ blocker, candidates, count: candidates.length }))
    .sort((a, b) => b.count - a.count);
}

export type SeriesTallies = {
  candidates: number;
  readyToRegister: number;
  cannotBeRegistered: number;
  entryFeesUnpaid: string;
  daysLeft: number | null;
};

export async function seriesTallies(args: {
  companyId: string;
  seriesId: string;
  now: number;
}): Promise<SeriesTallies> {
  const [series, rows] = await Promise.all([
    prisma.schoolExamSeries.findFirst({
      where: { id: args.seriesId, companyId: args.companyId },
      select: { entriesCloseAt: true, currency: true },
    }),
    candidateRoll({ companyId: args.companyId, seriesId: args.seriesId }),
  ]);
  const unpaid = rows
    .filter((row) => !row.fees.paid)
    .reduce((sum, row) => sum.plus(row.fees.total), new Prisma.Decimal(0));
  return {
    candidates: rows.length,
    readyToRegister: rows.filter((row) => row.blockers.length === 0 && row.status === "DRAFT")
      .length,
    cannotBeRegistered: rows.filter((row) => row.blockers.length > 0).length,
    entryFeesUnpaid: unpaid.toFixed(2),
    daysLeft: daysAway(series?.entriesCloseAt ?? null, args.now),
  };
}

export type SubjectEntryRow = {
  examSubjectId: string;
  subject: string;
  code: string;
  entries: number;
  totalFee: string;
  invoiced: string;
  paid: string;
  toInvoice: string;
};

/** Entries by subject, with the money each one carries. */
export async function entriesBySubject(args: {
  companyId: string;
  seriesId: string;
}): Promise<SubjectEntryRow[]> {
  const entries = await prisma.schoolExamEntry.findMany({
    where: { companyId: args.companyId, seriesId: args.seriesId, status: { not: "WITHDRAWN" } },
    select: {
      fee: true,
      feeInvoiceId: true,
      feeInvoice: { select: { balanceAmount: true } },
      examSubject: { select: { id: true, name: true, code: true } },
    },
  });

  const bySubject = new Map<string, SubjectEntryRow & { _fee: Prisma.Decimal; _inv: Prisma.Decimal; _paid: Prisma.Decimal }>();
  for (const entry of entries) {
    const key = entry.examSubject.id;
    const seen =
      bySubject.get(key) ??
      ({
        examSubjectId: key,
        subject: entry.examSubject.name,
        code: entry.examSubject.code,
        entries: 0,
        totalFee: "0.00",
        invoiced: "0.00",
        paid: "0.00",
        toInvoice: "0.00",
        _fee: new Prisma.Decimal(0),
        _inv: new Prisma.Decimal(0),
        _paid: new Prisma.Decimal(0),
      } as SubjectEntryRow & { _fee: Prisma.Decimal; _inv: Prisma.Decimal; _paid: Prisma.Decimal });
    seen.entries += 1;
    seen._fee = seen._fee.plus(entry.fee ?? 0);
    if (entry.feeInvoiceId) seen._inv = seen._inv.plus(entry.fee ?? 0);
    if (entry.feeInvoice?.balanceAmount.lessThanOrEqualTo(0)) {
      seen._paid = seen._paid.plus(entry.fee ?? 0);
    }
    bySubject.set(key, seen);
  }

  return [...bySubject.values()]
    .map((row) => ({
      examSubjectId: row.examSubjectId,
      subject: row.subject,
      code: row.code,
      entries: row.entries,
      totalFee: row._fee.toFixed(2),
      invoiced: row._inv.toFixed(2),
      paid: row._paid.toFixed(2),
      toInvoice: row._fee.minus(row._inv).toFixed(2),
    }))
    .sort((a, b) => b.entries - a.entries);
}

/**
 * Candidates outside the subject rule.
 *
 * Six is the fewest worth entering and nine the school's own maximum. Both are
 * the school's rules rather than the board's, which is why `SUBJECT_RULE` is one
 * exported constant and not two magic numbers in a query.
 */
export async function candidatesOutsideTheRule(args: {
  companyId: string;
  seriesId: string;
}) {
  const rows = await candidateRoll({ companyId: args.companyId, seriesId: args.seriesId });
  return {
    below: rows.filter((row) => row.subjects < SUBJECT_RULE.minimum),
    over: rows.filter((row) => row.subjects > SUBJECT_RULE.maximum),
    rule: SUBJECT_RULE,
  };
}

/**
 * Register the year group as candidates.
 *
 * One act, and the one the roll exists for: every `ACTIVE` pupil in the cohort
 * becomes a candidate in `DRAFT`. It allocates candidate numbers in surname
 * order from the next free number at this centre and series, because that is
 * how a school hands the board a list and how it finds a pupil on the schedule
 * afterwards.
 *
 * It does **not** enter anybody for a subject and it does not refuse a pupil
 * with a blocker. A candidate with no birth certificate is a row the office has
 * to act on, and refusing to create it would hide the work.
 */
export async function registerCohort(args: {
  companyId: string;
  actorId: string;
  seriesId: string;
  classId?: string;
  level?: number;
}) {
  const series = await prisma.schoolExamSeries.findFirst({
    where: { id: args.seriesId, companyId: args.companyId },
    select: { id: true, cohortLevel: true, status: true },
  });
  if (!series) throw new ExamError("That series is not this school's.");

  const level = args.level ?? series.cohortLevel ?? undefined;
  const pupils = await prisma.schoolStudent.findMany({
    where: {
      companyId: args.companyId,
      status: "ACTIVE",
      ...(args.classId ? { currentClassId: args.classId } : {}),
      ...(level != null ? { currentClass: { level } } : {}),
    },
    select: { id: true, lastName: true, firstName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  if (pupils.length === 0) {
    throw new ExamError(
      "There is nobody on the roll for that year group, so there is no cohort to register.",
    );
  }

  const existing = await prisma.schoolCandidate.findMany({
    where: { companyId: args.companyId, seriesId: series.id },
    select: { studentId: true, candidateNumber: true },
  });
  const already = new Set(existing.map((row) => row.studentId));
  const highest = existing.reduce((max, row) => {
    const value = Number(row.candidateNumber ?? "0");
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  let next = highest;
  const created: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const pupil of pupils) {
      if (already.has(pupil.id)) continue;
      next += 1;
      const candidate = await tx.schoolCandidate.create({
        data: {
          companyId: args.companyId,
          seriesId: series.id,
          studentId: pupil.id,
          candidateNumber: String(next).padStart(4, "0"),
        },
        select: { id: true },
      });
      created.push(candidate.id);
    }
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.exam.candidate.registered",
      entityType: "SchoolExamSeries",
      entityId: series.id,
      payload: { registered: created.length, cohortLevel: level ?? null },
    });
  });

  return { registered: created.length, skipped: pupils.length - created.length };
}

/** Enter a candidate for a subject, or take the entry back. */
/**
 * What a school calls each exam level out loud.
 */
const LEVEL_LABELS: Record<string, string> = {
  O_LEVEL: "Ordinary Level",
  A_LEVEL: "Advanced Level",
  IGCSE: "IGCSE",
};

/**
 * Resolve a syllabus subject against a series, and refuse anything not on it.
 *
 * Three checks, and each one is a different failure.
 *
 * The **company** check is the tenant boundary. `examSubjectId` arrives in a
 * request body, and unchecked it writes one school's entry against another
 * school's syllabus row — `enterSubject` was the one place in this file that
 * skipped it, in a file whose own comments explain why it must not be.
 *
 * The **board** and **level** checks are the domain ones. A Cambridge IGCSE
 * subject on a ZIMSEC O-Level series is a row the board will reject, and the
 * place to find that out is at the desk in June rather than from the board in
 * November.
 */
export async function subjectOnSeries(args: {
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
    // Name both levels. "A different level" sends somebody back to a list of
    // forty to work out which one.
    throw new ExamError(
      `That subject is ${LEVEL_LABELS[subject.level]}, and this series is ${LEVEL_LABELS[series.level]}.`,
      422,
    );
  }

  return { series, subject };
}

export async function enterSubject(args: {
  companyId: string;
  actorId: string;
  seriesId: string;
  candidateId: string;
  examSubjectId: string;
  now?: Date;
}) {
  const [series, candidate] = await Promise.all([
    prisma.schoolExamSeries.findFirst({
      where: { id: args.seriesId, companyId: args.companyId },
      select: {
        id: true,
        entriesCloseAt: true,
        lateEntriesCloseAt: true,
        feePerSubject: true,
        lateFeePerSubject: true,
        currency: true,
        status: true,
      },
    }),
    prisma.schoolCandidate.findFirst({
      where: { id: args.candidateId, companyId: args.companyId, seriesId: args.seriesId },
      // The number as well as the id: a refusal that names the candidate is
      // usable when somebody is entering a hundred of them in a row.
      select: { id: true, status: true, candidateNumber: true },
    }),
  ]);
  if (!series) throw new ExamError("That series is not this school's.");
  if (!candidate) throw new ExamError("That candidate is not on this series.");

  // The check this function skipped. `examSubjectId` arrives in a request body
  // and was written straight through, so one school could enter a candidate
  // against another school's syllabus row — and a Cambridge subject could be
  // entered on a ZIMSEC series, which the board finds out about in November.
  const { subject } = await subjectOnSeries({
    companyId: args.companyId,
    seriesId: args.seriesId,
    examSubjectId: args.examSubjectId,
  });

  const now = args.now ?? new Date();
  // Past the late door there is no door. The board does not take an entry after
  // amendments close, and a screen that accepted one would be promising a
  // sitting the child will not get.
  if (series.lateEntriesCloseAt && now > series.lateEntriesCloseAt) {
    throw new ExamError(
      "Late entries for this series have closed. The board will not take another one — this is the deadline that costs a pupil a year.",
    );
  }
  const isLate = Boolean(series.entriesCloseAt && now > series.entriesCloseAt);
  const fee = isLate
    ? (series.lateFeePerSubject ?? series.feePerSubject)
    : series.feePerSubject;

  /*
    A withdrawn entry is revived rather than re-created.

    `withdrawEntry` sets `status = WITHDRAWN` and keeps the row, and
    `@@unique([candidateId, examSubjectId])` means the row is still in the way.
    So a pupil who dropped Geography in June and picked it up again in July hit
    an unhandled unique-constraint violation — a 500 with a Prisma message, on
    an ordinary thing a school does, with no way round it short of the database.

    Reviving also gets the money right: `isLate` and the fee are recomputed
    against today, so a subject re-entered after the deadline carries the late
    fee it now attracts rather than the one it attracted in June.
  */
  const existing = await prisma.schoolExamEntry.findFirst({
    where: { candidateId: candidate.id, examSubjectId: args.examSubjectId },
    select: { id: true, status: true, feeInvoiceId: true },
  });

  if (existing) {
    if (existing.status !== "WITHDRAWN") {
      throw new ExamError(
        `Candidate ${candidate.candidateNumber} is already entered for ${subject.name}.`,
        409,
      );
    }

    /*
      The fee is repriced only where nothing has been billed for it yet.

      `withdrawEntry` deliberately keeps `feeInvoiceId` — its own comment says a
      withdrawal after the amendment deadline is not refunded — and
      `invoiceEntries` only picks up entries with `feeInvoiceId: null`. So a
      revived entry that was already invoiced is correctly not billed a second
      time.

      But its `fee` must not move either. `listSeries` computes what a series
      has invoiced by summing `entry.fee` across entries that have an invoice,
      so repricing an already-invoiced entry silently walks the series'
      "invoiced" total away from what the family was actually charged — and that
      total is what a bursar reconciles the board's bill against.

      An uninvoiced revival IS repriced, which is the point: a subject picked
      back up after the deadline attracts the late fee it now attracts, not the
      one it attracted in June.
    */
    const alreadyBilled = existing.feeInvoiceId !== null;

    return prisma.schoolExamEntry.update({
      where: { id: existing.id },
      data: {
        status: "DRAFT",
        withdrawnAt: null,
        ...(alreadyBilled ? {} : { isLate, fee: fee ?? null, currency: series.currency }),
      },
      select: { id: true, isLate: true, fee: true },
    });
  }

  return prisma.schoolExamEntry.create({
    data: {
      companyId: args.companyId,
      seriesId: series.id,
      candidateId: candidate.id,
      examSubjectId: args.examSubjectId,
      isLate,
      fee: fee ?? null,
      currency: series.currency,
      status: "DRAFT",
    },
    select: { id: true, isLate: true, fee: true },
  });
}

export async function withdrawEntry(args: {
  companyId: string;
  actorId: string;
  entryId: string;
}) {
  const entry = await prisma.schoolExamEntry.findFirst({
    where: { id: args.entryId, companyId: args.companyId },
    select: { id: true, feeInvoiceId: true, seriesId: true },
  });
  if (!entry) throw new ExamError("That entry is not this school's.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolExamEntry.update({
      where: { id: entry.id },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() },
      select: { id: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.exam.entry.withdrawn",
      entityType: "SchoolExamEntry",
      entityId: entry.id,
      payload: {
        seriesId: entry.seriesId,
        // Said in the audit row because it is the thing a bursar asks about: a
        // withdrawal after the amendment deadline is not refunded.
        wasInvoiced: Boolean(entry.feeInvoiceId),
      },
    });
    return updated;
  });
}

/**
 * Invoice the entries.
 *
 * One invoice per candidate, one line per subject, and the entry rows carry the
 * invoice id — which is the link the fee ledger never had. Without it,
 * per-subject `Invoiced`, `Paid` and `To invoice` cannot be computed from a
 * `SchoolFeeInvoiceLine` whose `feeCode` is free text.
 */
export async function invoiceEntries(args: {
  companyId: string;
  actorId: string;
  seriesId: string;
  termId: string;
  dueInDays?: number;
}) {
  const entries = await prisma.schoolExamEntry.findMany({
    where: {
      companyId: args.companyId,
      seriesId: args.seriesId,
      status: { not: "WITHDRAWN" },
      feeInvoiceId: null,
    },
    select: {
      id: true,
      fee: true,
      currency: true,
      isLate: true,
      candidate: { select: { id: true, studentId: true, candidateNumber: true } },
      examSubject: { select: { name: true, code: true } },
    },
  });
  if (entries.length === 0) {
    throw new ExamError("Every entry on this series has already been invoiced.");
  }

  const byCandidate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byCandidate.get(entry.candidate.studentId) ?? [];
    list.push(entry);
    byCandidate.set(entry.candidate.studentId, list);
  }

  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + (args.dueInDays ?? 14) * DAY);
  let invoices = 0;

  for (const [studentId, theirs] of byCandidate) {
    const invoiceNo = await reserveIdentifier(prisma, {
      companyId: args.companyId,
      entity: "SCHOOL_FEE_INVOICE",
    });
    const total = theirs.reduce((sum, entry) => sum.plus(entry.fee ?? 0), new Prisma.Decimal(0));

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.schoolFeeInvoice.create({
        data: {
          companyId: args.companyId,
          invoiceNo,
          studentId,
          termId: args.termId,
          issueDate,
          dueDate,
          status: "ISSUED",
          issuedById: args.actorId,
          issuedAt: issueDate,
          createdById: args.actorId,
          subTotal: total,
          totalAmount: total,
          balanceAmount: total,
          baseAmount: total,
          currency: theirs[0]?.currency ?? "USD",
          notes: "Public exam entry fees",
          lines: {
            create: theirs.map((entry) => ({
              companyId: args.companyId,
              feeCode: `EXAM-${entry.examSubject.code}`,
              description: `${entry.examSubject.name} (${entry.examSubject.code})${entry.isLate ? " — late entry" : ""}`,
              quantity: new Prisma.Decimal(1),
              unitAmount: entry.fee ?? new Prisma.Decimal(0),
              lineTotal: entry.fee ?? new Prisma.Decimal(0),
            })),
          },
        },
        select: { id: true },
      });
      await tx.schoolExamEntry.updateMany({
        where: { id: { in: theirs.map((entry) => entry.id) } },
        data: { feeInvoiceId: invoice.id, status: "ENTERED", enteredAt: issueDate },
      });
      invoices += 1;
    });
  }

  return { invoices, entries: entries.length };
}

/**
 * Build the entry file, and record that it was built.
 *
 * A human uploads it. `SCH-DEP-02` defers the board's API, and this record is
 * the only account of which file a school sent, built from which entries, by
 * whom. It is not a submission receipt and must never be drawn as one.
 */
export async function buildEntryFile(args: {
  companyId: string;
  actorId: string;
  seriesId: string;
}) {
  const entries = await prisma.schoolExamEntry.findMany({
    where: { companyId: args.companyId, seriesId: args.seriesId, status: { not: "WITHDRAWN" } },
    select: {
      // The id as well as the number: the number is what the board reads and
      // the id is what moves the candidate's status when the file is built.
      candidateId: true,
      candidate: {
        select: {
          candidateNumber: true,
          certifiedName: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              gender: true,
              nationalId: true,
              birthCertificateNo: true,
            },
          },
        },
      },
      examSubject: { select: { code: true, name: true } },
    },
    orderBy: { candidate: { candidateNumber: "asc" } },
  });
  if (entries.length === 0) throw new ExamError("There is nothing entered to build a file from.");

  const header = [
    "candidate_number",
    "certified_name",
    "date_of_birth",
    "sex",
    "national_id",
    "birth_certificate",
    "syllabus_code",
    "syllabus_name",
  ];
  const lines = entries.map((entry) =>
    [
      entry.candidate.candidateNumber ?? "",
      entry.candidate.certifiedName ??
        `${entry.candidate.student.lastName}, ${entry.candidate.student.firstName}`,
      entry.candidate.student.dateOfBirth?.toISOString().slice(0, 10) ?? "",
      entry.candidate.student.gender ?? "",
      entry.candidate.student.nationalId ?? "",
      entry.candidate.student.birthCertificateNo ?? "",
      entry.examSubject.code,
      entry.examSubject.name,
    ]
      .map((cell) => (cell.includes(",") ? `"${cell}"` : cell))
      .join(","),
  );

  const candidateCount = new Set(entries.map((entry) => entry.candidate.candidateNumber)).size;
  // Everybody actually on the file. The count above is de-duplicated by
  // candidate NUMBER for the run's own record; this is the set of rows to move.
  const candidateIds = [...new Set(entries.map((entry) => entry.candidateId))];

  const run = await prisma.$transaction(async (tx) => {
    /*
      The candidates on this file are now entered.

      `SchoolCandidateStatus.ENTERED` is documented in the schema as "On the
      entry file that went to the board", and building the file is the moment
      that becomes true — but nothing anywhere ever wrote it. Every candidate
      stayed DRAFT for the life of the series, so the Registered tab was
      permanently empty, "ready to register" never fell, and the status index on
      `[companyId, seriesId, status]` served one value.

      `updateMany` from DRAFT only: a candidate somebody withdrew by hand is not
      dragged back onto the file by a later rebuild.
    */
    await tx.schoolCandidate.updateMany({
      where: {
        companyId: args.companyId,
        seriesId: args.seriesId,
        id: { in: candidateIds },
        status: "DRAFT",
      },
      data: { status: "ENTERED", enteredAt: new Date() },
    });

    const created = await tx.schoolExamEntryFileRun.create({
      data: {
        companyId: args.companyId,
        seriesId: args.seriesId,
        builtByUserId: args.actorId,
        entryCount: entries.length,
        candidateCount,
      },
      select: { id: true, builtAt: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.exam.entry-file.built",
      entityType: "SchoolExamSeries",
      entityId: args.seriesId,
      payload: { entries: entries.length, candidates: candidateCount, runId: created.id },
    });
    return created;
  });

  return { run, csv: [header.join(","), ...lines].join("\n"), entries: entries.length, candidates: candidateCount };
}

/* ── seating ─────────────────────────────────────────────────────────── */

export async function seatingPlan(args: { companyId: string; sessionId: string }) {
  const session = await prisma.schoolExamSession.findFirst({
    where: { id: args.sessionId, companyId: args.companyId },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      label: true,
      paper: {
        select: {
          code: true,
          durationMinutes: true,
          examSubject: { select: { name: true, code: true } },
        },
      },
      series: { select: { id: true, name: true, level: true } },
      rooms: {
        select: {
          id: true,
          purpose: true,
          capacity: true,
          invigilatorName: true,
          room: { select: { id: true, code: true, name: true, capacity: true } },
          invigilator: { select: { user: { select: { name: true, email: true } } } },
          _count: { select: { seats: true } },
        },
      },
      seats: {
        select: {
          id: true,
          seatNumber: true,
          allocationId: true,
          candidate: {
            select: {
              id: true,
              candidateNumber: true,
              student: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { seatNumber: "asc" },
      },
    },
  });
  if (!session) throw new ExamError("That exam session is not this school's.");

  const [candidates, arrangements, clashes] = await Promise.all([
    prisma.schoolCandidate.findMany({
      where: {
        companyId: args.companyId,
        seriesId: session.series.id,
        entries: {
          some: {
            status: { not: "WITHDRAWN" },
            ...(session.paper
              ? { examSubject: { code: session.paper.examSubject.code } }
              : {}),
          },
        },
      },
      select: {
        id: true,
        candidateNumber: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { candidateNumber: "asc" },
    }),
    prisma.schoolExamAccessArrangement.findMany({
      where: {
        companyId: args.companyId,
        candidate: { seriesId: session.series.id },
      },
      select: {
        id: true,
        kind: true,
        extraTimePercent: true,
        detail: true,
        approvedAt: true,
        candidate: {
          select: {
            id: true,
            candidateNumber: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    // Two papers at once: another session that overlaps this one and shares a
    // candidate. It is the one thing on this screen that cannot be fixed by
    // moving a chair.
    prisma.schoolExamSession.findMany({
      where: {
        companyId: args.companyId,
        seriesId: session.series.id,
        id: { not: session.id },
        startsAt: { lt: session.endsAt ?? session.startsAt },
        ...(session.endsAt ? { endsAt: { gt: session.startsAt } } : {}),
      },
      select: {
        id: true,
        startsAt: true,
        paper: { select: { code: true, examSubject: { select: { name: true } } } },
        seats: { select: { candidateId: true } },
      },
    }),
  ]);

  const seatedIds = new Set(session.seats.map((seat) => seat.candidate.id));
  const clashingIds = new Set(
    clashes.flatMap((other) => other.seats.map((seat) => seat.candidateId)),
  );

  return {
    session: {
      id: session.id,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      label: session.label,
      paperCode: session.paper?.code ?? null,
      subject: session.paper?.examSubject.name ?? null,
      durationMinutes: session.paper?.durationMinutes ?? null,
      series: session.series,
    },
    rooms: session.rooms.map((allocation) => ({
      id: allocation.id,
      name: allocation.room.name,
      code: allocation.room.code,
      purpose: allocation.purpose,
      capacity: allocation.capacity ?? allocation.room.capacity ?? null,
      seats: allocation._count.seats,
      invigilator:
        allocation.invigilator?.user?.name ??
        allocation.invigilator?.user?.email ??
        allocation.invigilatorName ??
        null,
    })),
    seats: session.seats.map((seat) => ({
      id: seat.id,
      seatNumber: seat.seatNumber,
      allocationId: seat.allocationId,
      candidate: {
        id: seat.candidate.id,
        candidateNumber: seat.candidate.candidateNumber,
        name: `${seat.candidate.student.lastName}, ${seat.candidate.student.firstName}`,
      },
    })),
    stillToSeat: candidates
      .filter((candidate) => !seatedIds.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        candidateNumber: candidate.candidateNumber,
        name: `${candidate.student.lastName}, ${candidate.student.firstName}`,
      })),
    arrangements: arrangements.map((arrangement) => ({
      id: arrangement.id,
      kind: arrangement.kind,
      extraTimePercent: arrangement.extraTimePercent,
      detail: arrangement.detail,
      approved: Boolean(arrangement.approvedAt),
      candidate: {
        id: arrangement.candidate.id,
        candidateNumber: arrangement.candidate.candidateNumber,
        name: `${arrangement.candidate.student.lastName}, ${arrangement.candidate.student.firstName}`,
      },
    })),
    chips: {
      candidates: candidates.length,
      seated: seatedIds.size,
      stillToSeat: candidates.length - seatedIds.size,
      sittingTwoAtOnce: clashingIds.size,
    },
    clashes: clashes.map((other) => ({
      id: other.id,
      startsAt: other.startsAt,
      paperCode: other.paper?.code ?? null,
      subject: other.paper?.examSubject.name ?? null,
      candidates: other.seats.length,
    })),
  };
}

/**
 * Seat the candidates who are not seated.
 *
 * Numbered in candidate order across the rooms in the order they were
 * allocated, filling each to its capacity: a hall seated in candidate-number
 * order is one an invigilator can walk down with a list, and a school that
 * renumbers on the morning loses that.
 */
export async function assignSeats(args: {
  companyId: string;
  sessionId: string;
  candidateIds?: string[];
}) {
  const plan = await seatingPlan({ companyId: args.companyId, sessionId: args.sessionId });
  if (plan.rooms.length === 0) {
    throw new ExamError("No room has been given to this session yet, so there is nowhere to seat anybody.");
  }
  const toSeat = args.candidateIds
    ? plan.stillToSeat.filter((candidate) => args.candidateIds?.includes(candidate.id))
    : plan.stillToSeat;
  if (toSeat.length === 0) throw new ExamError("Everybody in this session already has a seat.");

  const seatsByRoom = new Map(plan.rooms.map((room) => [room.id, room.seats]));
  let seated = 0;

  await prisma.$transaction(async (tx) => {
    for (const candidate of toSeat) {
      const room = plan.rooms.find((entry) => {
        const used = seatsByRoom.get(entry.id) ?? 0;
        return entry.capacity == null || used < entry.capacity;
      });
      if (!room) break;
      const used = (seatsByRoom.get(room.id) ?? 0) + 1;
      seatsByRoom.set(room.id, used);
      await tx.schoolExamSeat.create({
        data: {
          companyId: args.companyId,
          sessionId: args.sessionId,
          allocationId: room.id,
          candidateId: candidate.id,
          seatNumber: String(used).padStart(3, "0"),
        },
      });
      seated += 1;
    }
  });

  if (seated < toSeat.length) {
    return {
      seated,
      short: toSeat.length - seated,
      message: `${seated} seated. The rooms in this session are full — ${toSeat.length - seated} candidates still have nowhere to sit.`,
    };
  }
  return { seated, short: 0, message: null };
}

/* ── results ─────────────────────────────────────────────────────────── */

export async function resultsForSeries(args: {
  companyId: string;
  seriesId: string;
  compareSeriesId?: string;
}) {
  const series = await prisma.schoolExamSeries.findFirst({
    where: { id: args.seriesId, companyId: args.companyId },
    select: { id: true, name: true, level: true, board: { select: { name: true } } },
  });
  if (!series) throw new ExamError("That series is not this school's.");

  const [results, compare, candidates] = await Promise.all([
    prisma.schoolExamResult.findMany({
      where: { companyId: args.companyId, seriesId: args.seriesId },
      select: {
        id: true,
        grade: true,
        points: true,
        isRemark: true,
        releasedAt: true,
        examSubject: { select: { id: true, name: true, code: true } },
        candidate: {
          select: {
            id: true,
            candidateNumber: true,
            student: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
    args.compareSeriesId
      ? prisma.schoolExamResult.findMany({
          where: { companyId: args.companyId, seriesId: args.compareSeriesId },
          select: {
            grade: true,
            isRemark: true,
            candidateId: true,
            examSubject: { select: { code: true } },
          },
        })
      : Promise.resolve([]),
    prisma.schoolCandidate.count({
      where: { companyId: args.companyId, seriesId: args.seriesId },
    }),
  ]);

  // A remark is kept beside the original rather than over it, so both rows
  // exist for one sitting — which is the point when somebody asks what the
  // first grade was, and a disaster if anything counts them both. A D upgraded
  // to a C would otherwise record two sittings, give the candidate two grades
  // and move the subject's pass rate twice. So every figure below is computed
  // over the EFFECTIVE grade: one row per candidate per subject, the remark
  // winning where there is one.
  const effective = new Map<string, (typeof results)[number]>();
  for (const result of results) {
    const key = `${result.candidate.id}:${result.examSubject.id}`;
    const seen = effective.get(key);
    if (!seen || (result.isRemark && !seen.isRemark)) effective.set(key, result);
  }
  const counted = [...effective.values()];

  const bySubject = new Map<
    string,
    { subject: string; code: string; sat: number; passes: number; bands: Map<string, number> }
  >();
  for (const result of counted) {
    const key = result.examSubject.code;
    const seen =
      bySubject.get(key) ??
      {
        subject: result.examSubject.name,
        code: key,
        sat: 0,
        passes: 0,
        bands: new Map<string, number>(),
      };
    seen.sat += 1;
    if (isPass(series.level, result.grade)) seen.passes += 1;
    const band = bandFor(result.grade);
    seen.bands.set(band, (seen.bands.get(band) ?? 0) + 1);
    bySubject.set(key, seen);
  }

  // The series being compared against gets the same treatment, or a remark in
  // last November's grades moves this November's comparison.
  const compareEffective = new Map<string, (typeof compare)[number]>();
  for (const result of compare) {
    const key = `${result.candidateId}:${result.examSubject.code}`;
    const seen = compareEffective.get(key);
    if (!seen || (result.isRemark && !seen.isRemark)) compareEffective.set(key, result);
  }

  const compareBySubject = new Map<string, { sat: number; passes: number }>();
  for (const result of compareEffective.values()) {
    const key = result.examSubject.code;
    const seen = compareBySubject.get(key) ?? { sat: 0, passes: 0 };
    seen.sat += 1;
    if (isPass(series.level, result.grade)) seen.passes += 1;
    compareBySubject.set(key, seen);
  }

  const subjects = [...bySubject.values()]
    .map((row) => {
      const previous = compareBySubject.get(row.code);
      const rate = row.sat > 0 ? (row.passes / row.sat) * 100 : 0;
      const previousRate = previous && previous.sat > 0 ? (previous.passes / previous.sat) * 100 : null;
      return {
        subject: row.subject,
        code: row.code,
        sat: row.sat,
        passes: row.passes,
        passRate: Number(rate.toFixed(1)),
        bands: Object.fromEntries(row.bands),
        against: previousRate == null ? null : Number((rate - previousRate).toFixed(1)),
      };
    })
    .sort((a, b) => b.sat - a.sat);

  // Five or more at C: the sentence a head says, counted per candidate.
  const byCandidate = new Map<string, { passes: number; grades: number; aStarOrA: number; ungraded: number }>();
  for (const result of counted) {
    const key = result.candidate.id;
    const seen = byCandidate.get(key) ?? { passes: 0, grades: 0, aStarOrA: 0, ungraded: 0 };
    seen.grades += 1;
    if (isPass(series.level, result.grade)) seen.passes += 1;
    if (gradeRank(series.level, result.grade) <= gradeRank(series.level, "A")) seen.aStarOrA += 1;
    if (result.grade.trim().toUpperCase() === "U") seen.ungraded += 1;
    byCandidate.set(key, seen);
  }

  return {
    series,
    candidates,
    subjects,
    stats: {
      candidates,
      fiveOrMoreAtC: [...byCandidate.values()].filter((row) => row.passes >= 5).length,
      aStarAndA: [...byCandidate.values()].reduce((total, row) => total + row.aStarOrA, 0),
      ungraded: [...byCandidate.values()].reduce((total, row) => total + row.ungraded, 0),
    },
    subjectsThatFell: subjects.filter((row) => (row.against ?? 0) < 0).length,
    // Counted over every row rather than the effective ones, because "how many
    // grades were amended" is a question about the remarks themselves.
    amended: results.filter((result) => result.isRemark).length,
    statementReceived: results.some((result) => result.releasedAt != null),
    byCandidate: [...byCandidate.entries()].map(([candidateId, row]) => {
      const candidate = counted.find((result) => result.candidate.id === candidateId)!.candidate;
      return {
        candidateId,
        candidateNumber: candidate.candidateNumber,
        name: `${candidate.student.lastName}, ${candidate.student.firstName}`,
        studentId: candidate.student.id,
        ...row,
        grades: counted
          .filter((result) => result.candidate.id === candidateId)
          .map((result) => ({
            subject: result.examSubject.name,
            code: result.examSubject.code,
            grade: result.grade,
            points: result.points,
            isRemark: result.isRemark,
          })),
      };
    }),
  };
}

/** Capture results, one grade at a time or in a batch off the statement. */
export async function captureResults(args: {
  companyId: string;
  actorId: string;
  seriesId: string;
  rows: Array<{
    candidateId: string;
    examSubjectId: string;
    grade: string;
    points?: number | null;
    isRemark?: boolean;
  }>;
}) {
  if (args.rows.length === 0) throw new ExamError("There is nothing to capture.");
  const series = await prisma.schoolExamSeries.findFirst({
    where: { id: args.seriesId, companyId: args.companyId },
    select: { id: true },
  });
  if (!series) throw new ExamError("That series is not this school's.");

  // Every id in the request is checked against this company and this series
  // before a single row is written.
  //
  // The foreign keys here are global — a candidate id is a uuid and the
  // database will happily attach another tenant's candidate to this tenant's
  // series — so without this a malformed or hostile request could write a
  // foreign pupil into this school's analytics, and `resultsForSeries` would
  // then read their name back out. Checking the whole
  // candidate-entry-subject relationship is also what stops a grade being
  // captured for a subject the candidate was never entered for, which would
  // appear in a pass rate as a sitting that did not happen.
  const entries = await prisma.schoolExamEntry.findMany({
    where: {
      companyId: args.companyId,
      seriesId: series.id,
      status: { not: "WITHDRAWN" },
      candidateId: { in: [...new Set(args.rows.map((row) => row.candidateId))] },
    },
    select: { candidateId: true, examSubjectId: true },
  });
  const entered = new Set(entries.map((entry) => `${entry.candidateId}:${entry.examSubjectId}`));
  const strays = args.rows.filter(
    (row) => !entered.has(`${row.candidateId}:${row.examSubjectId}`),
  );
  if (strays.length > 0) {
    throw new ExamError(
      strays.length === args.rows.length
        ? "None of those candidates is entered for those subjects in this series, so there is nothing to grade."
        : `${strays.length} of those grades are for a candidate or a subject that is not entered in this series. Nothing was captured.`,
    );
  }

  const written = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const row of args.rows) {
      await tx.schoolExamResult.upsert({
        where: {
          candidateId_examSubjectId_isRemark: {
            candidateId: row.candidateId,
            examSubjectId: row.examSubjectId,
            isRemark: row.isRemark ?? false,
          },
        },
        create: {
          companyId: args.companyId,
          seriesId: series.id,
          candidateId: row.candidateId,
          examSubjectId: row.examSubjectId,
          grade: row.grade.trim().toUpperCase(),
          points: row.points ?? null,
          isRemark: row.isRemark ?? false,
          releasedAt: new Date(),
          capturedByUserId: args.actorId,
        },
        update: {
          grade: row.grade.trim().toUpperCase(),
          points: row.points ?? null,
          capturedByUserId: args.actorId,
        },
      });
      count += 1;
    }
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.exam.results.captured",
      entityType: "SchoolExamSeries",
      entityId: series.id,
      payload: { grades: count },
    });
    return count;
  });

  return { captured: written };
}

/** The boards, centres and subjects a school enters with. */
export async function examReferenceData(companyId: string) {
  const [boards, centres, subjects] = await Promise.all([
    prisma.schoolExamBoard.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.schoolExamCentre.findMany({
      where: { companyId, isActive: true },
      select: { id: true, number: true, boardId: true },
      orderBy: { number: "asc" },
    }),
    prisma.schoolExamSubject.findMany({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true, level: true, boardId: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return { boards, centres, subjects };
}
