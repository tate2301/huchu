import type { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";

export {
  CALENDAR_KIND_LABELS,
  defaultIsTeachingDay,
  type SchoolCalendarEventKindValue,
} from "./calendar-kinds";

/**
 * Academic year and term resolution.
 *
 * Every term-scoped entity in the schools pack — enrolment, fee structure,
 * invoice, waiver, result sheet, publish window, boarding allocation,
 * class-subject assignment — is keyed by `termId`. Before this module there was
 * no way to create a year or a term at all, and call sites resolved "the
 * current term" by repeating `findFirst({ where: { isActive: true } })`.
 *
 * The single active year per company, and the single active term per year, are
 * enforced by partial unique indexes in the database, so `getCurrentTerm` can
 * trust that at most one row comes back.
 */

export type SchoolTermSummary = {
  id: string;
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  academicYear: {
    id: string;
    code: string;
    name: string;
    startDate: Date;
    endDate: Date;
  };
};

const termSummarySelect = {
  id: true,
  code: true,
  name: true,
  startDate: true,
  endDate: true,
  isActive: true,
  academicYear: {
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      endDate: true,
    },
  },
} satisfies Prisma.SchoolTermSelect;

/** The company's active term, or null when the school has not opened one. */
export async function getCurrentTerm(
  companyId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<SchoolTermSummary | null> {
  return db.schoolTerm.findFirst({
    where: { companyId, isActive: true },
    select: termSummarySelect,
  });
}

export class NoActiveTermError extends Error {
  constructor() {
    super(
      "This school has no active term. Open an academic year and term under Academics before continuing.",
    );
    this.name = "NoActiveTermError";
  }
}

/**
 * The company's active term, or a throw. Use in write paths that cannot
 * meaningfully proceed without a term; the message is written for the person
 * setting the school up, not for a log.
 */
export async function requireCurrentTerm(
  companyId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<SchoolTermSummary> {
  const term = await getCurrentTerm(companyId, db);
  if (!term) throw new NoActiveTermError();
  return term;
}

/** The term containing `at`, preferring the active one when they overlap. */
export async function getTermForDate(
  companyId: string,
  at: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<SchoolTermSummary | null> {
  return db.schoolTerm.findFirst({
    where: {
      companyId,
      startDate: { lte: at },
      endDate: { gte: at },
    },
    select: termSummarySelect,
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });
}

export function isDateRangeValid(startDate: Date, endDate: Date) {
  return (
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    startDate < endDate
  );
}

/** True when [startA, endA] and [startB, endB] share at least one day. */
export function rangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) {
  return startA <= endB && startB <= endA;
}

/**
 * Terms within one academic year may not overlap — a date must resolve to a
 * single term for registers, invoices and result sheets to be unambiguous.
 */
export async function findOverlappingTerm(
  input: {
    companyId: string;
    academicYearId: string;
    startDate: Date;
    endDate: Date;
    excludeTermId?: string;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return db.schoolTerm.findFirst({
    where: {
      companyId: input.companyId,
      academicYearId: input.academicYearId,
      ...(input.excludeTermId ? { id: { not: input.excludeTermId } } : {}),
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
    select: { id: true, code: true, name: true },
  });
}

/** Academic years may not overlap either — a year is the enclosing period. */
export async function findOverlappingAcademicYear(
  input: {
    companyId: string;
    startDate: Date;
    endDate: Date;
    excludeYearId?: string;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return db.schoolAcademicYear.findFirst({
    where: {
      companyId: input.companyId,
      ...(input.excludeYearId ? { id: { not: input.excludeYearId } } : {}),
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
    select: { id: true, code: true, name: true },
  });
}

/**
 * Make one academic year active, standing the previous one down first. The
 * partial unique index rejects two active rows, so both writes share a
 * transaction.
 */
export async function activateAcademicYear(input: {
  companyId: string;
  academicYearId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.schoolAcademicYear.updateMany({
      where: {
        companyId: input.companyId,
        isActive: true,
        id: { not: input.academicYearId },
      },
      data: { isActive: false },
    });

    return tx.schoolAcademicYear.update({
      where: { id: input.academicYearId },
      data: { isActive: true },
    });
  });
}

/**
 * Make one term active. Activating a term in a different year activates that
 * year too — a term cannot be current while its year is not.
 */
export async function activateTerm(input: { companyId: string; termId: string }) {
  return prisma.$transaction(async (tx) => {
    const term = await tx.schoolTerm.findFirst({
      where: { id: input.termId, companyId: input.companyId },
      select: { id: true, academicYearId: true },
    });
    if (!term) return null;

    await tx.schoolTerm.updateMany({
      where: {
        companyId: input.companyId,
        isActive: true,
        id: { not: term.id },
      },
      data: { isActive: false },
    });

    await tx.schoolAcademicYear.updateMany({
      where: {
        companyId: input.companyId,
        isActive: true,
        id: { not: term.academicYearId },
      },
      data: { isActive: false },
    });

    await tx.schoolAcademicYear.update({
      where: { id: term.academicYearId },
      data: { isActive: true },
    });

    return tx.schoolTerm.update({
      where: { id: term.id },
      data: { isActive: true },
      select: termSummarySelect,
    });
  });
}

// ---------------------------------------------------------------------------
// School days (S-1.2)
// ---------------------------------------------------------------------------

/**
 * Whether the school is open on a given day, and why not when it is not.
 *
 * Before this, "no register for Form 2 on Tuesday" and "Tuesday was a public
 * holiday" were the same absence of a row, so no report could tell a missing
 * register from a closed school — which is the whole point of asking.
 *
 * Three things have to agree for a day to be a school day: it falls inside a
 * term, it is not a weekend, and no calendar event closes the school over it.
 * The weekend rule is a default a school can override by putting a teaching
 * event on the day, because Saturday school is normal here.
 */
export type SchoolDayVerdict = {
  isSchoolDay: boolean;
  /** Written for a person reading a report, not for a log. */
  reason: string;
  termId: string | null;
};

/** Midnight-to-midnight bounds for a calendar day, in UTC. */
function dayBounds(date: Date) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export async function getSchoolDay(
  companyId: string,
  date: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<SchoolDayVerdict> {
  const { start, end } = dayBounds(date);

  const [term, events] = await Promise.all([
    db.schoolTerm.findFirst({
      where: { companyId, startDate: { lte: end }, endDate: { gte: start } },
      select: { id: true, name: true },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    }),
    db.schoolCalendarEvent.findMany({
      where: { companyId, startDate: { lte: end }, endDate: { gte: start } },
      select: { title: true, isTeachingDay: true },
    }),
  ]);

  // An explicit teaching event opens the school on a day it would otherwise be
  // shut — a Saturday exam, a catch-up day in the holidays.
  const opensSchool = events.find((event) => event.isTeachingDay);
  const closesSchool = events.find((event) => !event.isTeachingDay);

  if (closesSchool) {
    return {
      isSchoolDay: false,
      reason: closesSchool.title,
      termId: term?.id ?? null,
    };
  }

  if (opensSchool) {
    return { isSchoolDay: true, reason: opensSchool.title, termId: term?.id ?? null };
  }

  if (!term) {
    return { isSchoolDay: false, reason: "Outside term time", termId: null };
  }

  const weekday = start.getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return { isSchoolDay: false, reason: "Weekend", termId: term.id };
  }

  return { isSchoolDay: true, reason: term.name, termId: term.id };
}

/**
 * Every school day in a range, so "registers not taken" is a set difference
 * rather than a guess. Bounded to a year: a caller asking for a decade wants a
 * report this is not, and building 3,650 dates in memory to answer it is how
 * that becomes a production incident.
 */
export async function listSchoolDays(
  companyId: string,
  from: Date,
  to: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Date[]> {
  const { start } = dayBounds(from);
  const { start: last } = dayBounds(to);
  const days: Date[] = [];

  const maxDays = 366;
  for (let index = 0; index <= maxDays; index += 1) {
    const day = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    if (day > last) break;
    const verdict = await getSchoolDay(companyId, day, db);
    if (verdict.isSchoolDay) days.push(day);
  }

  return days;
}
