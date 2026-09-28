import { SchoolPastoralBand } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import {
  pastoralClearanceFor,
  readNote,
  type PastoralViewer,
} from "@/lib/schools/pastoral-access";

/**
 * Writing pastoral notes, and the register of who may read them.
 *
 * Reading is `lib/schools/pastoral-access.ts` and nothing here duplicates it.
 * This file is the other half: composing a note, asking to see one, and the
 * clearance table the `Who may read what` register draws.
 *
 * There is deliberately **no export, no print and no CSV in this module.** All
 * four other conduct screens have one; pastoral has a shield instead, and that
 * absence is the `Never` rule enacted in the chrome. It must survive
 * implementation: no export endpoint, no print route, no
 * `schools.reports/export` source key.
 */

export class PastoralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PastoralError";
  }
}

export const BAND_LABELS: Record<SchoolPastoralBand, string> = {
  PASTORAL_TEAM_ONLY: "Pastoral team only",
  HEAD_AND_PASTORAL_TEAM: "Head and pastoral team",
  // Not paraphrased, not shortened, and not `Safeguarding`. The band names the
  // mechanism: only the individuals named on the note.
  SAFEGUARDING_NAMED_INDIVIDUALS: "Safeguarding — named individuals",
};

export const BANDS: SchoolPastoralBand[] = [
  "PASTORAL_TEAM_ONLY",
  "HEAD_AND_PASTORAL_TEAM",
  "SAFEGUARDING_NAMED_INDIVIDUALS",
];

/**
 * Write a note.
 *
 * The band is chosen **when the note is written**, not afterwards: there is no
 * "change visibility" verb on a written note, because widening one is a
 * decision about a child that needs a reason and a record rather than a
 * dropdown.
 *
 * A safeguarding note must name its readers in the same act. A note under that
 * band with nobody named on it is readable by nobody at all — including its
 * author on their next session — which looks like a bug and is worse than one.
 */
export async function writeNote(args: {
  companyId: string;
  actorId: string;
  studentId: string;
  body: string;
  band: SchoolPastoralBand;
  reviewDueAt?: Date | null;
  referredTo?: string | null;
  /** User ids named on the note. Required for the safeguarding band. */
  namedReaderIds?: string[];
}) {
  const student = await prisma.schoolStudent.findFirst({
    where: { id: args.studentId, companyId: args.companyId },
    select: { id: true },
  });
  if (!student) throw new PastoralError("That pupil is not on this school's roll.");
  if (!args.body.trim()) throw new PastoralError("A note with no body is not a note.");

  const named = [...new Set([...(args.namedReaderIds ?? []), args.actorId])];
  if (args.band === "SAFEGUARDING_NAMED_INDIVIDUALS" && named.length < 2) {
    throw new PastoralError(
      "A safeguarding note is read only by the people named on it. Name at least one other person, or nobody but you will ever be able to open it.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const note = await tx.schoolPastoralNote.create({
      data: {
        companyId: args.companyId,
        studentId: args.studentId,
        authorUserId: args.actorId,
        body: args.body.trim(),
        band: args.band,
        reviewDueAt: args.reviewDueAt ?? null,
        referredTo: args.referredTo?.trim() || null,
        referredAt: args.referredTo?.trim() ? new Date() : null,
      },
      select: { id: true },
    });
    for (const userId of named) {
      await tx.schoolPastoralNoteReader.create({
        data: {
          companyId: args.companyId,
          noteId: note.id,
          userId,
          grantedByUserId: args.actorId,
        },
      });
    }
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.pastoral.note.written",
      entityType: "SchoolPastoralNote",
      entityId: note.id,
      // The band and the pupil, never the body. An audit trail that quoted the
      // note would be a second copy of it outside the access model.
      payload: { band: args.band, studentId: args.studentId, namedReaders: named.length },
    });
    return note;
  });
}

/**
 * Open a note, and record that it was opened.
 *
 * The audit row is the reason this is not just `readNote`: a row-level access
 * model nobody can audit is a claim rather than a control. Not drawn on any
 * artboard — required by the subject matter.
 */
export async function openNote(viewer: PastoralViewer, noteId: string) {
  const note = await readNote(viewer, noteId);
  if (!note) return null;
  await writeSchoolAuditEvent(prisma, {
    companyId: viewer.companyId,
    actorId: viewer.userId,
    eventType: "schools.pastoral.note.read",
    entityType: "SchoolPastoralNote",
    entityId: note.id,
    payload: { band: note.band, studentId: note.student.id },
  });
  return note;
}

/**
 * `Ask to see it` — raised against a note whose content the requester has not
 * seen.
 *
 * It notifies the individuals named on the note. It grants nothing: only a
 * reader row grants, and only somebody already on the note may write one. What
 * happens next is school policy, which is why the outcome starts `PENDING` and
 * this function does not decide it.
 */
export async function requestAccess(args: {
  companyId: string;
  actorId: string;
  noteId: string;
  reason?: string;
}) {
  const note = await prisma.schoolPastoralNote.findFirst({
    where: { id: args.noteId, companyId: args.companyId },
    // Deliberately no body and no pupil: the requester has not seen either and
    // this function must not be the thing that shows them.
    select: { id: true, band: true },
  });
  if (!note) throw new PastoralError("That note is not this school's.");

  const existing = await prisma.schoolPastoralAccessRequest.findFirst({
    where: {
      companyId: args.companyId,
      noteId: note.id,
      requestedByUserId: args.actorId,
      outcome: "PENDING",
    },
    select: { id: true },
  });
  if (existing) {
    throw new PastoralError("You have already asked to see this one. It is still waiting.");
  }

  return prisma.$transaction(async (tx) => {
    const request = await tx.schoolPastoralAccessRequest.create({
      data: {
        companyId: args.companyId,
        noteId: note.id,
        requestedByUserId: args.actorId,
        reason: args.reason?.trim() || null,
      },
      select: { id: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.pastoral.access.requested",
      entityType: "SchoolPastoralNote",
      entityId: note.id,
      reason: args.reason?.trim(),
      payload: { band: note.band },
    });
    return request;
  });
}

export type ReaderRow = {
  kind: "person";
  userId: string;
  name: string;
  role: string | null;
  /** `Pastoral team only · Head and pastoral team`, or `Nothing · unless named on the note`. */
  mayRead: string;
  cleared: boolean;
  /** True where this is the person reading the page — drawn as `— you`. */
  isYou: boolean;
};

/** The four destinations a note never reaches. Systems, filed as rules. */
export const NEVER_DESTINATIONS = [
  "The parent portal",
  "The report card",
  "A leaving certificate or testimonial",
  "Any export, spreadsheet or print",
] as const;

/**
 * The `Who may read a pastoral note` register.
 *
 * It comes before the notes on the screen, which is the composition decision
 * the whole page turns on: the reader is told who can see this before they are
 * shown anything to see.
 */
export async function readerRegister(args: {
  companyId: string;
  viewerUserId: string;
}): Promise<{ readers: ReaderRow[]; staffTotal: number }> {
  const [clearances, staffTotal] = await Promise.all([
    prisma.schoolPastoralClearance.findMany({
      where: { companyId: args.companyId, revokedAt: null },
      select: {
        userId: true,
        bands: true,
        scope: true,
        scopeLevel: true,
        scopeClass: { select: { name: true } },
      },
    }),
    prisma.user.count({ where: { companyId: args.companyId, isActive: true } }),
  ]);

  const userIds = [...new Set([...clearances.map((row) => row.userId), args.viewerUserId])];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const clearanceByUser = new Map(clearances.map((row) => [row.userId, row]));

  const readers: ReaderRow[] = userIds.map((userId) => {
    const user = userById.get(userId);
    const clearance = clearanceByUser.get(userId);
    const bands = (clearance?.bands ?? []).filter(
      (band) => band !== "SAFEGUARDING_NAMED_INDIVIDUALS",
    );
    const scopeSuffix =
      clearance?.scope === "YEAR_GROUP" && clearance.scopeLevel != null
        ? `Year ${clearance.scopeLevel} pupils`
        : clearance?.scope === "CLASS" && clearance.scopeClass
          ? `${clearance.scopeClass.name} pupils`
          : null;
    const mayRead = bands.length
      ? [bands.map((band) => BAND_LABELS[band]).join(" · "), scopeSuffix]
          .filter(Boolean)
          .join(" · ")
      : // Verbatim, and not softened: seniority does not reach a note.
        "Nothing · unless named on the note";
    return {
      kind: "person" as const,
      userId,
      name: user?.name ?? user?.email ?? "Not named",
      role: user?.role ?? null,
      mayRead,
      cleared: bands.length > 0,
      isYou: userId === args.viewerUserId,
    };
  });

  return {
    readers: readers.sort((a, b) => Number(b.cleared) - Number(a.cleared) || a.name.localeCompare(b.name)),
    staffTotal,
  };
}

/** Grant a clearance: which bands, and which pupils. */
export async function grantClearance(args: {
  companyId: string;
  actorId: string;
  userId: string;
  bands: SchoolPastoralBand[];
  scope: "SCHOOL" | "YEAR_GROUP" | "CLASS";
  scopeLevel?: number | null;
  scopeClassId?: string | null;
}) {
  const bands = args.bands.filter((band) => band !== "SAFEGUARDING_NAMED_INDIVIDUALS");
  if (bands.length === 0) {
    throw new PastoralError(
      "A clearance has to name at least one band. Safeguarding notes are reached by being named on them, not by a clearance.",
    );
  }
  if (args.scope === "YEAR_GROUP" && args.scopeLevel == null) {
    throw new PastoralError("Say which class this clearance covers.");
  }
  if (args.scope === "CLASS" && !args.scopeClassId) {
    throw new PastoralError("Say which class this clearance covers.");
  }

  return prisma.$transaction(async (tx) => {
    const clearance = await tx.schoolPastoralClearance.upsert({
      where: { companyId_userId: { companyId: args.companyId, userId: args.userId } },
      create: {
        companyId: args.companyId,
        userId: args.userId,
        bands,
        scope: args.scope,
        scopeLevel: args.scopeLevel ?? null,
        scopeClassId: args.scopeClassId ?? null,
        grantedByUserId: args.actorId,
      },
      update: {
        bands,
        scope: args.scope,
        scopeLevel: args.scopeLevel ?? null,
        scopeClassId: args.scopeClassId ?? null,
        grantedByUserId: args.actorId,
        grantedAt: new Date(),
        revokedAt: null,
      },
      select: { id: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.pastoral.clearance.granted",
      entityType: "SchoolPastoralClearance",
      entityId: clearance.id,
      payload: { userId: args.userId, bands, scope: args.scope },
    });
    return clearance;
  });
}

export async function revokeClearance(args: {
  companyId: string;
  actorId: string;
  userId: string;
}) {
  const clearance = await prisma.schoolPastoralClearance.findFirst({
    where: { companyId: args.companyId, userId: args.userId, revokedAt: null },
    select: { id: true },
  });
  if (!clearance) throw new PastoralError("That person holds no clearance to revoke.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolPastoralClearance.update({
      where: { id: clearance.id },
      data: { revokedAt: new Date() },
      select: { id: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.pastoral.clearance.revoked",
      entityType: "SchoolPastoralClearance",
      entityId: clearance.id,
      payload: { userId: args.userId },
    });
    return updated;
  });
}

/**
 * Whether this person has any clearance at all.
 *
 * The page answers `NotYourJob` rather than 404 for somebody who holds the
 * grant and no clearance: hiding the destination entirely would make a nurse
 * think the feature does not exist.
 */
export async function hasAnyClearance(viewer: PastoralViewer): Promise<boolean> {
  const clearance = await pastoralClearanceFor(viewer);
  if (clearance && clearance.bands.length > 0) return true;
  const named = await prisma.schoolPastoralNoteReader.count({
    where: { companyId: viewer.companyId, userId: viewer.userId, revokedAt: null },
  });
  return named > 0;
}
