import { Prisma, SchoolPastoralBand } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Who may read which pastoral note.
 *
 * **Every read of a pastoral note goes through this file.** It exports the
 * `where` builder that decides what a reader may see and the two projections
 * that shape what comes back, and no caller may assemble its own query against
 * `SchoolPastoralNote`. The canvas annotation beside the artboard ends: *"Built
 * any other way, this is the feature that ends up in a newspaper."*
 *
 * ## Three mechanisms, not one
 *
 * A `band` column is necessary and nowhere near sufficient. Three of the
 * screen's five refusals cannot be expressed by an enum:
 *
 *   1. **Which bands.** A clearance names the bands its holder may read.
 *   2. **Which pupils.** `Pastoral team only · Year 3 pupils` is one band *and*
 *      a pupil scope. A system that models only the first shows a head of year
 *      a Form 1 note.
 *   3. **Named on the note.** `Safeguarding — named individuals` is reached by
 *      `SchoolPastoralNoteReader` and by nothing else — no role, no persona, no
 *      band grant, and no seniority. The Group Head is the most senior person
 *      in the group and reads `Nothing · unless named on the note`.
 *
 * ## Two rules about the body
 *
 * The body is selected **conditionally in the query**, never deleted from a
 * full object afterwards: a deleted field is one `JSON.stringify` away from
 * coming back. And the redacted shape is **constructed** from three columns
 * rather than filtered down from a note, so there is nothing behind it to
 * reveal.
 *
 * ## Withheld rows come back on purpose
 *
 * A head who cannot read a note should still know it exists. The count is shown
 * on the screen, the rows keep their place in date order, and a silent list is
 * a system nobody can audit. What a withheld row carries is an id, a date and a
 * band — not the pupil, because the pupil is the one fact that would let a
 * reader infer the content from context.
 */

export type PastoralViewer = {
  companyId: string;
  userId: string;
};

export type PastoralClearance = {
  id: string;
  userId: string;
  /** The bands this clearance reaches. Never the safeguarding band — see below. */
  bands: SchoolPastoralBand[];
  scope: "SCHOOL" | "YEAR_GROUP" | "CLASS";
  scopeLevel: number | null;
  scopeClassId: string | null;
  grantedAt: Date;
};

/**
 * The band no clearance can carry.
 *
 * A grant that named it would be a role reaching a safeguarding note, which is
 * the one thing the screen is drawn to prevent. It is stripped here rather than
 * validated at the point of granting, so a row written directly into the
 * database by a migration or a script cannot widen anybody's reach either.
 */
const NEVER_BY_BAND: SchoolPastoralBand = "SAFEGUARDING_NAMED_INDIVIDUALS";

export async function pastoralClearanceFor(
  viewer: PastoralViewer,
): Promise<PastoralClearance | null> {
  const row = await prisma.schoolPastoralClearance.findFirst({
    where: { companyId: viewer.companyId, userId: viewer.userId, revokedAt: null },
    select: {
      id: true,
      userId: true,
      bands: true,
      scope: true,
      scopeLevel: true,
      scopeClassId: true,
      grantedAt: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    bands: row.bands.filter((band) => band !== NEVER_BY_BAND),
  };
}

/**
 * The only `where` a caller may read notes through.
 *
 * Two branches, OR-ed: the bands this reader is cleared for within the pupils
 * they are cleared for, and the notes they are named on. A reader with no
 * clearance at all still gets the second branch, which is what
 * `Nothing · unless named on the note` means.
 */
export function readableNotesWhere(
  viewer: PastoralViewer,
  clearance: PastoralClearance | null,
): Prisma.SchoolPastoralNoteWhereInput {
  const namedOnTheNote: Prisma.SchoolPastoralNoteWhereInput = {
    readers: { some: { userId: viewer.userId, revokedAt: null } },
  };
  if (!clearance || clearance.bands.length === 0) {
    return { companyId: viewer.companyId, ...namedOnTheNote };
  }

  const pupilScope: Prisma.SchoolPastoralNoteWhereInput =
    clearance.scope === "YEAR_GROUP" && clearance.scopeLevel != null
      ? { student: { currentClass: { level: clearance.scopeLevel } } }
      : clearance.scope === "CLASS" && clearance.scopeClassId
        ? { student: { currentClassId: clearance.scopeClassId } }
        : {};

  return {
    companyId: viewer.companyId,
    OR: [{ band: { in: clearance.bands }, ...pupilScope }, namedOnTheNote],
  };
}

/** Everything a readable row draws. */
export type ReadableNote = {
  readable: true;
  id: string;
  writtenAt: Date;
  band: SchoolPastoralBand;
  body: string;
  reviewDueAt: Date | null;
  referredTo: string | null;
  referredAt: Date | null;
  closedAt: Date | null;
  authorUserId: string;
  authorName: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
};

/**
 * Everything a withheld row draws, which is three facts.
 *
 * No pupil, no author, no body, no review date. `A note you may not read` is
 * written in the second person because the reader, not the note, is what makes
 * it unreadable — and it is not `Restricted note` and not `Confidential`.
 */
export type WithheldNote = {
  readable: false;
  id: string;
  writtenAt: Date;
  band: SchoolPastoralBand;
};

export type ProjectedNote = ReadableNote | WithheldNote;

const READABLE_SELECT = {
  id: true,
  writtenAt: true,
  band: true,
  body: true,
  reviewDueAt: true,
  referredTo: true,
  referredAt: true,
  closedAt: true,
  authorUserId: true,
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      currentClass: { select: { name: true } },
      currentStream: { select: { name: true } },
    },
  },
} satisfies Prisma.SchoolPastoralNoteSelect;

export type PastoralFilters = {
  /** A year group — `SchoolClass.level`. */
  level?: number;
  band?: SchoolPastoralBand;
  /** `overdue` narrows to notes past their review date; `none` to those with none. */
  review?: "overdue" | "due" | "none";
  studentId?: string;
  search?: string;
  limit?: number;
};

function filterWhere(filters: PastoralFilters): Prisma.SchoolPastoralNoteWhereInput {
  const where: Prisma.SchoolPastoralNoteWhereInput = {};
  if (filters.level != null) where.student = { currentClass: { level: filters.level } };
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.band) where.band = filters.band;
  if (filters.review === "overdue") where.reviewDueAt = { lt: new Date() };
  if (filters.review === "due") where.reviewDueAt = { gte: new Date() };
  if (filters.review === "none") where.reviewDueAt = null;
  return where;
}

/**
 * Filters that may only ever narrow the readable half.
 *
 * The search box is the one control on this screen that could be turned into an
 * oracle: a reader who could search across withheld notes would learn a pupil's
 * name from a result count without ever seeing a body. So a search narrows the
 * readable query and is deliberately **not** applied to the withheld one, which
 * keeps its own count honest — the withheld total is a property of what exists,
 * not of what was typed.
 */
export type PastoralListing = {
  notes: ProjectedNote[];
  counts: {
    /** Notes this reader is cleared for. Per reader, not per school. */
    youMayRead: number;
    /** Notes that exist and are closed to this reader. */
    withheldFromYou: number;
    /** Past their review date, among the ones she may read. */
    reviewOverdue: number;
    /** Referred to somebody else. */
    referredOn: number;
  };
};

/**
 * The notes list, readable and withheld, interleaved in date order.
 *
 * Two queries rather than one filtered in memory, and that is the whole
 * security design: the readable query is the only one that selects `body`, and
 * the withheld query cannot return it because it does not ask for it.
 */
export async function listNotesForViewer(
  viewer: PastoralViewer,
  filters: PastoralFilters = {},
): Promise<PastoralListing> {
  const clearance = await pastoralClearanceFor(viewer);
  const readable = readableNotesWhere(viewer, clearance);
  const narrowed = filterWhere(filters);

  const search = filters.search?.trim();
  const searchWhere: Prisma.SchoolPastoralNoteWhereInput = search
    ? {
        OR: [
          { student: { firstName: { contains: search, mode: "insensitive" } } },
          { student: { lastName: { contains: search, mode: "insensitive" } } },
          { student: { studentNo: { contains: search, mode: "insensitive" } } },
          { body: { contains: search, mode: "insensitive" } },
          { referredTo: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const [rows, withheld, youMayRead, withheldFromYou, reviewOverdue, referredOn] =
    await Promise.all([
      prisma.schoolPastoralNote.findMany({
        where: { AND: [readable, narrowed, searchWhere] },
        select: READABLE_SELECT,
        orderBy: { writtenAt: "desc" },
        take: filters.limit ?? 100,
      }),
      prisma.schoolPastoralNote.findMany({
        where: { companyId: viewer.companyId, NOT: readable, ...narrowed },
        // Three columns. There is nothing behind the hatched bar to reveal.
        select: { id: true, writtenAt: true, band: true },
        orderBy: { writtenAt: "desc" },
        take: filters.limit ?? 100,
      }),
      prisma.schoolPastoralNote.count({ where: readable }),
      prisma.schoolPastoralNote.count({
        where: { companyId: viewer.companyId, NOT: readable },
      }),
      prisma.schoolPastoralNote.count({
        where: { AND: [readable, { reviewDueAt: { lt: new Date() } }] },
      }),
      prisma.schoolPastoralNote.count({
        where: { AND: [readable, { referredAt: { not: null } }] },
      }),
    ]);

  const authorNames = await resolveAuthorNames(rows.map((row) => row.authorUserId));

  const readableNotes: ProjectedNote[] = rows.map((row) => ({
    readable: true as const,
    id: row.id,
    writtenAt: row.writtenAt,
    band: row.band,
    body: row.body,
    reviewDueAt: row.reviewDueAt,
    referredTo: row.referredTo,
    referredAt: row.referredAt,
    closedAt: row.closedAt,
    authorUserId: row.authorUserId,
    authorName: authorNames.get(row.authorUserId) ?? null,
    student: {
      id: row.student.id,
      studentNo: row.student.studentNo,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      className: row.student.currentClass?.name ?? null,
      streamName: row.student.currentStream?.name ?? null,
    },
  }));

  // Constructed, not filtered. Three fields in, three fields out.
  const withheldNotes: ProjectedNote[] = withheld.map((row) => ({
    readable: false as const,
    id: row.id,
    writtenAt: row.writtenAt,
    band: row.band,
  }));

  const notes = [...readableNotes, ...withheldNotes].sort(
    (a, b) => b.writtenAt.getTime() - a.writtenAt.getTime(),
  );

  return {
    notes,
    counts: { youMayRead, withheldFromYou, reviewOverdue, referredOn },
  };
}

async function resolveAuthorNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((user) => [user.id, user.name ?? user.email]));
}

/**
 * One note, if this reader may read it.
 *
 * Returns null rather than throwing where they may not, and the caller answers
 * the same way it would for a note that does not exist — a 404 that
 * distinguishes "no such note" from "not for you" is an oracle.
 *
 * **A read fails closed.** There is no fallback projection: if the query
 * errors, nothing is returned.
 */
export async function readNote(
  viewer: PastoralViewer,
  noteId: string,
): Promise<ReadableNote | null> {
  const clearance = await pastoralClearanceFor(viewer);
  const readable = readableNotesWhere(viewer, clearance);
  const row = await prisma.schoolPastoralNote.findFirst({
    where: { AND: [readable, { id: noteId }] },
    select: READABLE_SELECT,
  });
  if (!row) return null;
  const names = await resolveAuthorNames([row.authorUserId]);
  return {
    readable: true,
    id: row.id,
    writtenAt: row.writtenAt,
    band: row.band,
    body: row.body,
    reviewDueAt: row.reviewDueAt,
    referredTo: row.referredTo,
    referredAt: row.referredAt,
    closedAt: row.closedAt,
    authorUserId: row.authorUserId,
    authorName: names.get(row.authorUserId) ?? null,
    student: {
      id: row.student.id,
      studentNo: row.student.studentNo,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      className: row.student.currentClass?.name ?? null,
      streamName: row.student.currentStream?.name ?? null,
    },
  };
}

/**
 * How many pastoral notes exist on one pupil, and nothing else.
 *
 * This is what the incident page's violet alert calls — `One pastoral note on
 * Tadiwa is not shown here.` It returns an integer. It must render identically
 * for a reader who is cleared and one who is not, because the presence or
 * absence of detail on a discipline page would otherwise be a side channel into
 * the pastoral record; so this deliberately ignores clearance, and deliberately
 * returns nothing a clearance would change.
 */
export async function pastoralNoteCountForStudent(args: {
  companyId: string;
  studentId: string;
}): Promise<number> {
  return prisma.schoolPastoralNote.count({
    where: { companyId: args.companyId, studentId: args.studentId, closedAt: null },
  });
}
