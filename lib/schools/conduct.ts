import { Prisma, SchoolConductTone, SchoolMeritKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";

/**
 * The behaviour record.
 *
 * S-12.1, specified in `docs/design-system/campus-expansion/conduct.md`. One
 * row per thing that happened, and four timestamps that say how far it has got:
 * reported, seen, sanction decided, home told.
 *
 * The sentence the whole page exists to prevent is *"the parent was never
 * informed"*. That is why `homeToldAt` is nullable rather than defaulted, why
 * the gap is a button in the row rather than a blank cell, and why
 * `conductTallies` counts it as its own chip instead of leaving it to be
 * noticed.
 *
 * Not `DisciplinaryAction`. That is the HR model — an employee, an approver and
 * a different body of law. The name collision is all the two share.
 */

export class ConductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConductError";
  }
}

/** What the log's `Home told` column draws. Three shapes, not two. */
export type HomeTold =
  | { state: "told"; at: Date; channel: string | null }
  /** Nobody has told them. The cell is a button. */
  | { state: "not-told" }
  /** Telling was not needed — the bus was late. A decision, not an omission. */
  | { state: "not-needed" };

export function homeTold(incident: {
  homeToldAt: Date | null;
  homeToldChannel: string | null;
  homeToldNeeded: boolean;
}): HomeTold {
  if (incident.homeToldAt) {
    return { state: "told", at: incident.homeToldAt, channel: incident.homeToldChannel };
  }
  if (!incident.homeToldNeeded) return { state: "not-needed" };
  return { state: "not-told" };
}

const INCIDENT_ROW_SELECT = {
  id: true,
  reference: true,
  occurredAt: true,
  summary: true,
  location: true,
  period: true,
  sanction: true,
  sanctionTone: true,
  sanctionDecidedAt: true,
  homeToldAt: true,
  homeToldChannel: true,
  homeToldNeeded: true,
  reportedByUserId: true,
  reportedAt: true,
  seenAt: true,
  category: { select: { id: true, code: true, name: true, tone: true } },
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      status: true,
      currentClass: { select: { id: true, name: true, level: true } },
      currentStream: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SchoolConductIncidentSelect;

export type IncidentRow = Prisma.SchoolConductIncidentGetPayload<{
  select: typeof INCIDENT_ROW_SELECT;
}> & {
  /** Who reported it, resolved from the user table in one pass. */
  reportedByName: string | null;
};

export type IncidentFilters = {
  companyId: string;
  termId?: string;
  classId?: string;
  /** A year group rather than a class — `SchoolClass.level`. */
  level?: number;
  categoryId?: string;
  /** `decided` narrows to incidents with a sanction; `undecided` to those without. */
  sanction?: "decided" | "undecided";
  /** `told`, `not-told` or `not-needed`, matching the three shapes of the cell. */
  home?: "told" | "not-told" | "not-needed";
  studentId?: string;
  search?: string;
  limit?: number;
};

function incidentWhere(filters: IncidentFilters): Prisma.SchoolConductIncidentWhereInput {
  const where: Prisma.SchoolConductIncidentWhereInput = { companyId: filters.companyId };
  if (filters.termId) where.termId = filters.termId;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  // Both narrow the same relation, so they compose into one filter rather than
  // overwriting each other — a class inside a year group is a legitimate thing
  // to ask for, and writing the second assignment over the first silently
  // dropped whichever the caller set first.
  if (filters.classId || filters.level != null) {
    where.student = {
      ...(filters.classId ? { currentClassId: filters.classId } : {}),
      ...(filters.level != null ? { currentClass: { level: filters.level } } : {}),
    };
  }
  if (filters.sanction === "decided") where.sanction = { not: null };
  if (filters.sanction === "undecided") where.sanction = null;
  if (filters.home === "told") where.homeToldAt = { not: null };
  // Not told is the queue: needed, and nobody has done it. A row marked "not
  // needed" is finished, and folding it in here would put the bus pupil in the
  // deputy head's chase list every Friday.
  if (filters.home === "not-told") {
    where.homeToldAt = null;
    where.homeToldNeeded = true;
  }
  if (filters.home === "not-needed") where.homeToldNeeded = false;
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    where.OR = [
      { summary: { contains: term, mode: "insensitive" } },
      { reference: { contains: term, mode: "insensitive" } },
      { sanction: { contains: term, mode: "insensitive" } },
      { student: { firstName: { contains: term, mode: "insensitive" } } },
      { student: { lastName: { contains: term, mode: "insensitive" } } },
      { student: { studentNo: { contains: term, mode: "insensitive" } } },
    ];
  }
  return where;
}

/**
 * Who reported each incident, in one query rather than one per row.
 *
 * The incident stores `reportedByUserId` as a bare id, the way the fee ledger
 * and the result sheets store theirs. A relation would add a back-reference to
 * `User` for every conduct table and buy nothing a single `IN` cannot.
 */
async function resolveStaffNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((user) => [user.id, user.name ?? user.email]));
}

export async function listIncidents(filters: IncidentFilters): Promise<IncidentRow[]> {
  const rows = await prisma.schoolConductIncident.findMany({
    where: incidentWhere(filters),
    select: INCIDENT_ROW_SELECT,
    // Newest first, which is the section's own heading.
    orderBy: { occurredAt: "desc" },
    take: filters.limit ?? 200,
  });
  const names = await resolveStaffNames(rows.map((row) => row.reportedByUserId));
  return rows.map((row) => ({
    ...row,
    reportedByName: names.get(row.reportedByUserId) ?? null,
  }));
}

export type ConductTallies = {
  /** Every incident logged this term. */
  thisTerm: number;
  /** No sanction recorded — the queue a deputy head opens for. */
  noSanctionDecided: number;
  /** Needed telling, and nobody has. */
  homeNotTold: number;
  /** Pupils with three or more this term. */
  threeOrMore: number;
};

/**
 * The four band chips.
 *
 * `homeNotTold` is deliberately not `homeToldAt: null` on its own: an incident
 * marked as not needing a call is finished, and counting it here would give the
 * chip a number nobody can ever clear.
 */
export async function conductTallies(args: {
  companyId: string;
  termId: string;
}): Promise<ConductTallies> {
  const { companyId, termId } = args;
  const [thisTerm, noSanctionDecided, homeNotTold, repeats] = await Promise.all([
    prisma.schoolConductIncident.count({ where: { companyId, termId } }),
    prisma.schoolConductIncident.count({ where: { companyId, termId, sanction: null } }),
    prisma.schoolConductIncident.count({
      where: { companyId, termId, homeToldAt: null, homeToldNeeded: true },
    }),
    prisma.schoolConductIncident.groupBy({
      by: ["studentId"],
      where: { companyId, termId },
      _count: { _all: true },
      having: { studentId: { _count: { gte: 3 } } },
    }),
  ]);
  return { thisTerm, noSanctionDecided, homeNotTold, threeOrMore: repeats.length };
}

export type RepeatRow = {
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
  count: number;
  /** `Lateness ×2, Uniform, Disruption` — what they were, in the school's words. */
  whatTheyWere: string;
  last: Date;
  tone: SchoolConductTone;
};

/**
 * Three or more this term, and what they were.
 *
 * The fourth column is what makes this a count rather than a judgement:
 * `Lateness ×3 — all three the R2 bus` sits in the same table as `Fighting,
 * Phone, Disruption`, and the reader decides which is a problem.
 *
 * ## The tone rule, which is not on the artboard
 *
 * The canvas draws Tariro Ncube's `3` plain and Simba Mafuta's `3` amber, so
 * the tone cannot be a threshold on the number — `conduct.md` says so and
 * leaves the rule to whoever writes the query. This is it:
 *
 *   - one category, and that category is drawn `PLAIN` → plain. Three latenesses
 *     on the same bus is one fact three times, and a school that tones it amber
 *     teaches its deputy head to ignore the column.
 *   - anything from four incidents up → red.
 *   - everything else → amber.
 *
 * So the tone is a property of the row and not of the count, which is the one
 * distinction this table exists to draw.
 */
export async function repeatOffenders(args: {
  companyId: string;
  termId: string;
  minimum?: number;
}): Promise<RepeatRow[]> {
  const minimum = args.minimum ?? 3;
  const grouped = await prisma.schoolConductIncident.groupBy({
    by: ["studentId"],
    where: { companyId: args.companyId, termId: args.termId },
    _count: { _all: true },
    _max: { occurredAt: true },
    having: { studentId: { _count: { gte: minimum } } },
  });
  if (grouped.length === 0) return [];

  const studentIds = grouped.map((row) => row.studentId);
  const [students, incidents] = await Promise.all([
    prisma.schoolStudent.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
        currentClass: { select: { name: true } },
        currentStream: { select: { name: true } },
      },
    }),
    prisma.schoolConductIncident.findMany({
      where: { companyId: args.companyId, termId: args.termId, studentId: { in: studentIds } },
      select: {
        studentId: true,
        occurredAt: true,
        category: { select: { name: true, tone: true } },
      },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  const byStudent = new Map<string, typeof incidents>();
  for (const incident of incidents) {
    const list = byStudent.get(incident.studentId) ?? [];
    list.push(incident);
    byStudent.set(incident.studentId, list);
  }
  const studentById = new Map(students.map((student) => [student.id, student]));

  return grouped
    .map((group) => {
      const student = studentById.get(group.studentId);
      const theirs = byStudent.get(group.studentId) ?? [];
      const counts = new Map<string, { times: number; tone: SchoolConductTone }>();
      for (const incident of theirs) {
        const seen = counts.get(incident.category.name);
        counts.set(incident.category.name, {
          times: (seen?.times ?? 0) + 1,
          tone: incident.category.tone,
        });
      }
      const whatTheyWere = [...counts.entries()]
        .sort((a, b) => b[1].times - a[1].times)
        .map(([name, { times }]) => (times > 1 ? `${name} ×${times}` : name))
        .join(", ");
      const count = group._count._all;
      const tones = [...counts.values()].map((entry) => entry.tone);
      const onlyOneCategory = counts.size === 1;
      const tone: SchoolConductTone = onlyOneCategory && tones[0] === "PLAIN"
        ? "PLAIN"
        : count >= 4
          ? "BAD"
          : "WARN";
      return {
        student: {
          id: group.studentId,
          studentNo: student?.studentNo ?? "",
          firstName: student?.firstName ?? "",
          lastName: student?.lastName ?? "",
          className: student?.currentClass?.name ?? null,
          streamName: student?.currentStream?.name ?? null,
        },
        count,
        whatTheyWere,
        last: group._max.occurredAt ?? new Date(0),
        tone,
      };
    })
    .sort((a, b) => b.count - a.count || b.last.getTime() - a.last.getTime());
}

/**
 * The next incident reference for this year: `CI-2026-0417`.
 *
 * Reads the highest existing number rather than counting rows, for the reason
 * `nextApplicationNo` already gives: an incident is never deleted, and counting
 * rows would hand one number to two children. The unique index is what actually
 * stops a collision; this makes it rare rather than routine.
 */
export async function nextIncidentReference(
  companyId: string,
  year: number,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const prefix = `CI-${year}-`;
  const latest = await db.schoolConductIncident.findFirst({
    where: { companyId, reference: { startsWith: prefix } },
    select: { reference: true },
    orderBy: { reference: "desc" },
  });
  const previous = latest ? Number(latest.reference.slice(prefix.length)) : 0;
  const next = Number.isFinite(previous) ? previous + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export type LogIncidentInput = {
  companyId: string;
  actorId: string;
  termId: string;
  studentId: string;
  categoryId: string;
  occurredAt: Date;
  summary: string;
  location?: string | null;
  period?: number | null;
  sanction?: string | null;
  sanctionTone?: SchoolConductTone;
  /** False where the school has decided there is nothing to tell home. */
  homeToldNeeded?: boolean;
  /** Other pupils who were there, each with their own sanction or none. */
  participants?: Array<{ studentId: string; sanction?: string | null }>;
};

/**
 * Log one incident.
 *
 * Two things happen in one transaction, and the second is the answer to
 * `conduct.md` open question 2 — are a demerit and an incident the same row?
 * They are two rows and one act: where the category carries `demeritPoints`,
 * logging the incident awards the demerit, so a teacher performs one act and
 * the two counts stay independently true. A demerit for something that was
 * never an incident (`Litter`, `No homework`) is awarded on its own.
 */
export async function logIncident(input: LogIncidentInput) {
  const student = await prisma.schoolStudent.findFirst({
    where: { id: input.studentId, companyId: input.companyId },
    select: { id: true, status: true, firstName: true, lastName: true },
  });
  if (!student) throw new ConductError("That pupil is not on this school's roll.");
  // The refusal the artboard does not draw and the spec asks for in writing. A
  // pupil who has left is not somebody the school can sanction or ring home
  // about, and a log that accepts one quietly is a log with rows nobody can act
  // on.
  if (student.status !== "ACTIVE" && student.status !== "SUSPENDED") {
    throw new ConductError(
      `${student.firstName} ${student.lastName} is not on the roll, so nothing can be logged against them. Put them back on the roll first.`,
    );
  }

  const category = await prisma.schoolConductCategory.findFirst({
    where: { id: input.categoryId, companyId: input.companyId },
    select: { id: true, name: true, tone: true, demeritPoints: true },
  });
  if (!category) throw new ConductError("That is not one of this school's categories.");

  /*
    The pupil the incident is about was checked; the others in it were not.

    `participants[].studentId` arrived in a request body and was written
    straight into `SchoolConductParticipant`. Unchecked, another school's pupil
    could be named in this school's behaviour log — and the incident page draws
    participants by name, so the row is both a write into their record and a
    disclosure of their name to a school they do not attend.

    One query for the lot: naming six pupils in a fight should not cost six
    round trips.
  */
  const participantIds = [
    ...new Set((input.participants ?? []).map((participant) => participant.studentId)),
  ];
  if (participantIds.length > 0) {
    const onRoll = await prisma.schoolStudent.count({
      where: { id: { in: participantIds }, companyId: input.companyId },
    });
    if (onRoll !== participantIds.length) {
      throw new ConductError("One of those pupils is not on this school's roll.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const reference = await nextIncidentReference(
      input.companyId,
      input.occurredAt.getFullYear(),
      tx,
    );
    const incident = await tx.schoolConductIncident.create({
      data: {
        companyId: input.companyId,
        termId: input.termId,
        studentId: input.studentId,
        categoryId: input.categoryId,
        reference,
        occurredAt: input.occurredAt,
        summary: input.summary.trim(),
        location: input.location?.trim() || null,
        period: input.period ?? null,
        reportedByUserId: input.actorId,
        sanction: input.sanction?.trim() || null,
        sanctionTone: input.sanctionTone ?? "PLAIN",
        sanctionDecidedByUserId: input.sanction?.trim() ? input.actorId : null,
        sanctionDecidedAt: input.sanction?.trim() ? new Date() : null,
        homeToldNeeded: input.homeToldNeeded ?? true,
      },
      select: { id: true, reference: true },
    });

    for (const participant of input.participants ?? []) {
      await tx.schoolConductParticipant.create({
        data: {
          companyId: input.companyId,
          incidentId: incident.id,
          studentId: participant.studentId,
          sanction: participant.sanction?.trim() || null,
        },
      });
    }

    if (category.demeritPoints && category.demeritPoints > 0) {
      const reason = await tx.schoolMeritReason.findFirst({
        where: {
          companyId: input.companyId,
          kind: SchoolMeritKind.DEMERIT,
          name: category.name,
          isActive: true,
        },
        select: { id: true },
      });
      if (reason) {
        await tx.schoolMeritEntry.create({
          data: {
            companyId: input.companyId,
            studentId: input.studentId,
            termId: input.termId,
            kind: SchoolMeritKind.DEMERIT,
            reasonId: reason.id,
            points: category.demeritPoints,
            incidentId: incident.id,
            awardedByUserId: input.actorId,
            note: input.summary.trim(),
          },
        });
      }
    }

    await writeSchoolAuditEvent(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      eventType: "schools.conduct.incident.logged",
      entityType: "SchoolConductIncident",
      entityId: incident.id,
      payload: { reference: incident.reference, studentId: input.studentId },
    });

    return incident;
  });
}

/**
 * Record that home was told.
 *
 * The one verb the behaviour log exists for. It stamps the time and the channel
 * and nothing else — it is not a message send, and the artboard is careful not
 * to draw it as one: a deputy head who has just put the phone down is recording
 * what she did, not asking the system to do it.
 */
export async function tellHome(args: {
  companyId: string;
  actorId: string;
  incidentId: string;
  channel: string;
  at?: Date;
}) {
  const incident = await prisma.schoolConductIncident.findFirst({
    where: { id: args.incidentId, companyId: args.companyId },
    select: { id: true, homeToldAt: true, reference: true },
  });
  if (!incident) throw new ConductError("That incident is not on this school's log.");
  // A school's record of what a parent was told has to still be true a year
  // later, which is the rule `SchoolMessage` already states about anything sent
  // to a family. Correcting it is a conversation, not a second click.
  if (incident.homeToldAt) {
    throw new ConductError(
      "Home has already been told on this incident, and that record cannot be rewritten. Add an update instead.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolConductIncident.update({
      where: { id: incident.id },
      data: {
        homeToldAt: args.at ?? new Date(),
        homeToldChannel: args.channel.trim(),
        homeToldByUserId: args.actorId,
        homeToldNeeded: true,
      },
      select: { id: true, homeToldAt: true, homeToldChannel: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.conduct.home-told",
      entityType: "SchoolConductIncident",
      entityId: incident.id,
      payload: { reference: incident.reference, channel: args.channel.trim() },
    });
    return updated;
  });
}

/** Mark an incident as one home does not need telling about. */
export async function markHomeNotNeeded(args: {
  companyId: string;
  actorId: string;
  incidentId: string;
  reason?: string;
}) {
  const incident = await prisma.schoolConductIncident.findFirst({
    where: { id: args.incidentId, companyId: args.companyId },
    select: { id: true, homeToldAt: true },
  });
  if (!incident) throw new ConductError("That incident is not on this school's log.");
  if (incident.homeToldAt) {
    throw new ConductError("Home has already been told on this incident.");
  }
  return prisma.schoolConductIncident.update({
    where: { id: incident.id },
    data: { homeToldNeeded: false },
    select: { id: true, homeToldNeeded: true },
  });
}

/** Edit an incident. Refuses once home has been told. */
export async function updateIncident(args: {
  companyId: string;
  actorId: string;
  incidentId: string;
  data: {
    summary?: string;
    categoryId?: string;
    occurredAt?: Date;
    location?: string | null;
    period?: number | null;
    sanction?: string | null;
    sanctionTone?: SchoolConductTone;
  };
}) {
  const incident = await prisma.schoolConductIncident.findFirst({
    where: { id: args.incidentId, companyId: args.companyId },
    select: { id: true, homeToldAt: true, sanction: true, reference: true },
  });
  if (!incident) throw new ConductError("That incident is not on this school's log.");
  // The second refusal the spec asks for in writing. Once a parent has been
  // told what happened, the school's account of it is a thing somebody else has
  // read; rewriting it silently makes the earlier conversation a lie.
  if (incident.homeToldAt) {
    throw new ConductError(
      "Home has been told about this incident, so the account of it cannot be rewritten. Add an update instead.",
    );
  }

  const decidingSanction = args.data.sanction?.trim() && !incident.sanction;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolConductIncident.update({
      where: { id: incident.id },
      data: {
        ...args.data,
        summary: args.data.summary?.trim(),
        /*
          Only written when it was actually sent.

          This was `location: args.data.location?.trim() || null`, which turns
          an ABSENT field into an explicit null: `undefined?.trim()` is
          `undefined`, and `undefined || null` is `null`. The PATCH route passes
          `body.location ?? undefined`, so any patch that did not resend the
          location — deciding a sanction, correcting the summary, changing the
          period — silently erased where the incident happened.

          An empty string still clears it, which is the reader deliberately
          rubbing it out. There is a real difference between "not mentioned"
          and "there is no location", and the old expression could not tell
          them apart.
        */
        ...(args.data.location !== undefined
          ? { location: args.data.location?.trim() || null }
          : {}),
        ...(decidingSanction
          ? { sanctionDecidedByUserId: args.actorId, sanctionDecidedAt: new Date() }
          : {}),
      },
      select: { id: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: decidingSanction
        ? "schools.conduct.sanction.decided"
        : "schools.conduct.incident.edited",
      entityType: "SchoolConductIncident",
      entityId: incident.id,
      payload: { reference: incident.reference },
    });
    return updated;
  });
}

/** Stamp that the head of year has seen it — step 2 of the review spine. */
export async function markIncidentSeen(args: {
  companyId: string;
  actorId: string;
  incidentId: string;
}) {
  const incident = await prisma.schoolConductIncident.findFirst({
    where: { id: args.incidentId, companyId: args.companyId },
    select: { id: true, seenAt: true },
  });
  if (!incident) throw new ConductError("That incident is not on this school's log.");
  if (incident.seenAt) return { id: incident.id, seenAt: incident.seenAt };
  return prisma.schoolConductIncident.update({
    where: { id: incident.id },
    data: { seenAt: new Date(), seenByUserId: args.actorId },
    select: { id: true, seenAt: true },
  });
}

/** An account of what happened, from a member of staff or from the pupil. */
export async function addAccount(args: {
  companyId: string;
  actorId: string;
  incidentId: string;
  authorKind: "STAFF" | "STUDENT";
  authorStudentId?: string | null;
  body: string;
  takenAt?: Date;
}) {
  const incident = await prisma.schoolConductIncident.findFirst({
    where: { id: args.incidentId, companyId: args.companyId },
    select: { id: true },
  });
  if (!incident) throw new ConductError("That incident is not on this school's log.");
  if (args.authorKind === "STUDENT" && !args.authorStudentId) {
    throw new ConductError("A pupil's account needs the pupil it came from.");
  }
  return prisma.schoolConductAccount.create({
    data: {
      companyId: args.companyId,
      incidentId: incident.id,
      authorKind: args.authorKind,
      authorUserId: args.authorKind === "STAFF" ? args.actorId : null,
      authorStudentId: args.authorKind === "STUDENT" ? args.authorStudentId : null,
      body: args.body.trim(),
      takenAt: args.takenAt ?? new Date(),
    },
    select: { id: true },
  });
}

/**
 * The conduct paragraph a report card prints.
 *
 * S-12.2 in full. It is a sentence made of counts rather than a list of
 * incidents: a report card is read by a parent at a kitchen table and a table
 * of nine rows in it is a different document.
 *
 * It reads incidents, sanctions and merits, and **nothing pastoral**. That is
 * one of the four never-destinations the pastoral screen draws, and
 * `lib/documents/schools-sources.test.ts` asserts it rather than trusting this
 * comment.
 */
export async function conductParagraph(args: {
  companyId: string;
  studentId: string;
  termId: string;
}): Promise<{ heading: string; body: string } | null> {
  const [term, incidents, merits] = await Promise.all([
    prisma.schoolTerm.findFirst({
      where: { id: args.termId, companyId: args.companyId },
      select: { name: true },
    }),
    prisma.schoolConductIncident.findMany({
      where: { companyId: args.companyId, studentId: args.studentId, termId: args.termId },
      select: {
        summary: true,
        sanction: true,
        category: { select: { name: true } },
      },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.schoolMeritEntry.findMany({
      where: {
        companyId: args.companyId,
        studentId: args.studentId,
        termId: args.termId,
        reversedAt: null,
      },
      select: { kind: true, points: true },
    }),
  ]);
  if (!term) return null;

  const meritPoints = merits
    .filter((entry) => entry.kind === "MERIT")
    .reduce((total, entry) => total + entry.points, 0);
  const demeritPoints = merits
    .filter((entry) => entry.kind === "DEMERIT")
    .reduce((total, entry) => total + entry.points, 0);

  const heading = `Conduct — ${term.name}`;
  if (incidents.length === 0 && merits.length === 0) {
    return { heading, body: "Nothing has been recorded this term." };
  }

  const byCategory = new Map<string, number>();
  for (const incident of incidents) {
    byCategory.set(incident.category.name, (byCategory.get(incident.category.name) ?? 0) + 1);
  }
  const sentences: string[] = [];
  if (incidents.length > 0) {
    const named = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, times]) => `${times === 1 ? "one" : times} for ${name.toLowerCase()}`)
      .join(", ");
    sentences.push(
      `${incidents.length === 1 ? "One incident" : `${incidents.length} incidents`} recorded: ${named}.`,
    );
    const sanctions = incidents.filter((incident) => incident.sanction).length;
    if (sanctions > 0) {
      sentences.push(
        `${sanctions === 1 ? "A sanction was" : `${sanctions} sanctions were`} recorded.`,
      );
    }
  }
  if (meritPoints > 0 || demeritPoints > 0) {
    const halves: string[] = [];
    if (meritPoints > 0) halves.push(`${meritPoints} merit ${meritPoints === 1 ? "point" : "points"}`);
    if (demeritPoints > 0) {
      halves.push(`${demeritPoints} demerit ${demeritPoints === 1 ? "point" : "points"}`);
    }
    sentences.push(`${halves.join(" and ")}.`);
  }
  return { heading, body: sentences.join(" ") };
}

/** The categories a school logs under, for the pickers and the filters. */
export async function conductCategories(companyId: string) {
  return prisma.schoolConductCategory.findMany({
    where: { companyId, isActive: true },
    select: { id: true, code: true, name: true, tone: true, demeritPoints: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
