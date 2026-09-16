import { Prisma, SchoolMeritKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";

/**
 * Merits and demerits — one ledger, read three ways.
 *
 * Every number on the merits screen is an aggregate over `SchoolMeritEntry`: by
 * pupil, by reason, by year group. Nothing is stored twice, which is what keeps
 * the arithmetic reconciling in three directions the way the artboard's does.
 *
 * A net is not good news or bad news. The screen leaves it untoned and so does
 * this file: `net` is returned as a number and the caller decides how to draw
 * it. What stops the table being a scoreboard is `lastRecorded` — a pupil at
 * −7 whose last recorded thing is *"Set out the hall for prize giving,
 * unasked"* is a different pupil from one at −7 whose last recorded thing is a
 * fight, and the net alone cannot tell you which you are looking at.
 */

export class MeritError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeritError";
  }
}

export type MeritTallies = {
  merits: number;
  demerits: number;
  /** `merits − demerits`. Deliberately untoned. */
  net: number;
  /** Pupils on the roll with no entry of either kind. The number nobody looks at. */
  pupilsWithNeither: number;
};

export async function meritTallies(args: {
  companyId: string;
  termId: string;
}): Promise<MeritTallies> {
  const { companyId, termId } = args;
  const [merits, demerits, onRoll, withEntries] = await Promise.all([
    prisma.schoolMeritEntry.aggregate({
      where: { companyId, termId, kind: "MERIT", reversedAt: null },
      _sum: { points: true },
    }),
    prisma.schoolMeritEntry.aggregate({
      where: { companyId, termId, kind: "DEMERIT", reversedAt: null },
      _sum: { points: true },
    }),
    prisma.schoolStudent.count({ where: { companyId, status: "ACTIVE" } }),
    prisma.schoolMeritEntry.groupBy({
      by: ["studentId"],
      where: { companyId, termId, reversedAt: null },
    }),
  ]);
  const meritPoints = merits._sum.points ?? 0;
  const demeritPoints = demerits._sum.points ?? 0;
  return {
    merits: meritPoints,
    demerits: demeritPoints,
    net: meritPoints - demeritPoints,
    // The roll, not the ledger: a pupil with nothing recorded has no row to
    // count, so the only way to this number is the difference.
    pupilsWithNeither: Math.max(0, onRoll - withEntries.length),
  };
}

export type MeritPupilRow = {
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
  merits: number;
  demerits: number;
  net: number;
  /** The last thing recorded, which is what stops this being a scoreboard. */
  lastRecorded: {
    kind: SchoolMeritKind;
    reason: string;
    at: Date;
    note: string | null;
  } | null;
};

export type MeritLedgerFilters = {
  companyId: string;
  termId: string;
  level?: number;
  /** A class, which is what the screen's `ClassFilter` returns. */
  classId?: string;
  streamId?: string;
  studentId?: string;
  search?: string;
  sort?: "net-desc" | "net-asc" | "merits-desc" | "demerits-desc" | "name";
  limit?: number;
};

/** The by-pupil table. */
export async function meritLedger(filters: MeritLedgerFilters): Promise<MeritPupilRow[]> {
  const studentWhere: Prisma.SchoolStudentWhereInput = {
    companyId: filters.companyId,
    status: "ACTIVE",
  };
  if (filters.level != null) studentWhere.currentClass = { level: filters.level };
  if (filters.classId) studentWhere.currentClassId = filters.classId;
  if (filters.streamId) studentWhere.currentStreamId = filters.streamId;
  if (filters.studentId) studentWhere.id = filters.studentId;
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    studentWhere.OR = [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { studentNo: { contains: term, mode: "insensitive" } },
    ];
  }

  const students = await prisma.schoolStudent.findMany({
    where: studentWhere,
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      currentClass: { select: { name: true } },
      currentStream: { select: { name: true } },
      meritEntries: {
        where: { termId: filters.termId, reversedAt: null },
        select: {
          kind: true,
          points: true,
          awardedAt: true,
          note: true,
          reason: { select: { name: true } },
        },
        orderBy: { awardedAt: "desc" },
      },
    },
    take: filters.limit ?? 400,
  });

  const rows: MeritPupilRow[] = students
    .map((student) => {
      const merits = student.meritEntries
        .filter((entry) => entry.kind === "MERIT")
        .reduce((total, entry) => total + entry.points, 0);
      const demerits = student.meritEntries
        .filter((entry) => entry.kind === "DEMERIT")
        .reduce((total, entry) => total + entry.points, 0);
      const latest = student.meritEntries[0];
      return {
        student: {
          id: student.id,
          studentNo: student.studentNo,
          firstName: student.firstName,
          lastName: student.lastName,
          className: student.currentClass?.name ?? null,
          streamName: student.currentStream?.name ?? null,
        },
        merits,
        demerits,
        net: merits - demerits,
        lastRecorded: latest
          ? {
              kind: latest.kind,
              reason: latest.reason.name,
              at: latest.awardedAt,
              note: latest.note,
            }
          : null,
      };
    })
    // A pupil with nothing recorded belongs in the `Pupils with neither` chip,
    // not in a table of merits and demerits with two zeroes and a blank.
    .filter((row) => row.merits > 0 || row.demerits > 0);

  const sorters: Record<string, (a: MeritPupilRow, b: MeritPupilRow) => number> = {
    "net-desc": (a, b) => b.net - a.net,
    "net-asc": (a, b) => a.net - b.net,
    "merits-desc": (a, b) => b.merits - a.merits,
    "demerits-desc": (a, b) => b.demerits - a.demerits,
    name: (a, b) => a.student.lastName.localeCompare(b.student.lastName),
  };
  return rows.sort(sorters[filters.sort ?? "net-desc"]);
}

export type ReasonRow = { reason: string; times: number; points: number };
export type YearGroupRow = { level: number | null; label: string; net: number };

export type MeritSummary = {
  /**
   * `Merits · 669 of 1,284` — the six reasons drawn, and the whole. The two
   * numbers in the group header are not the same number: a school records
   * demerits for six things and merits for many more, and this is the only
   * place that says so.
   */
  merit: { rows: ReasonRow[]; shown: number; total: number };
  demerit: { rows: ReasonRow[]; shown: number; total: number };
  byYearGroup: YearGroupRow[];
  recordedThisTerm: number;
};

export async function meritSummary(args: {
  companyId: string;
  termId: string;
  topReasons?: number;
}): Promise<MeritSummary> {
  const { companyId, termId } = args;
  const top = args.topReasons ?? 6;

  const [grouped, reasons, byStudent] = await Promise.all([
    prisma.schoolMeritEntry.groupBy({
      by: ["reasonId", "kind"],
      where: { companyId, termId, reversedAt: null },
      _sum: { points: true },
      _count: { _all: true },
    }),
    prisma.schoolMeritReason.findMany({
      where: { companyId },
      select: { id: true, name: true, kind: true },
    }),
    prisma.schoolMeritEntry.findMany({
      where: { companyId, termId, reversedAt: null },
      select: {
        kind: true,
        points: true,
        student: { select: { currentClass: { select: { level: true, name: true } } } },
      },
    }),
  ]);

  const reasonById = new Map(reasons.map((reason) => [reason.id, reason]));
  const build = (kind: SchoolMeritKind) => {
    const rows = grouped
      .filter((row) => row.kind === kind)
      .map((row) => ({
        reason: reasonById.get(row.reasonId)?.name ?? "Not named",
        times: row._count._all,
        points: row._sum.points ?? 0,
      }))
      .sort((a, b) => b.points - a.points);
    const total = rows.reduce((sum, row) => sum + row.points, 0);
    const shownRows = rows.slice(0, top);
    return {
      rows: shownRows,
      shown: shownRows.reduce((sum, row) => sum + row.points, 0),
      total,
    };
  };

  const levels = new Map<string, { level: number | null; label: string; net: number }>();
  for (const entry of byStudent) {
    const level = entry.student.currentClass?.level ?? null;
    const label = level == null ? "No year group" : `Form ${level}`;
    const key = String(level ?? "none");
    const seen = levels.get(key) ?? { level, label, net: 0 };
    seen.net += entry.kind === "MERIT" ? entry.points : -entry.points;
    levels.set(key, seen);
  }

  const merit = build("MERIT");
  const demerit = build("DEMERIT");
  return {
    merit,
    demerit,
    byYearGroup: [...levels.values()].sort((a, b) => (a.level ?? 99) - (b.level ?? 99)),
    recordedThisTerm: merit.total + demerit.total,
  };
}

/** Award a merit or a demerit. */
export async function awardMeritEntry(args: {
  companyId: string;
  actorId: string;
  termId: string;
  studentId: string;
  reasonId: string;
  kind: SchoolMeritKind;
  points?: number;
  note?: string | null;
}) {
  const [student, reason] = await Promise.all([
    prisma.schoolStudent.findFirst({
      where: { id: args.studentId, companyId: args.companyId },
      select: { id: true, status: true },
    }),
    prisma.schoolMeritReason.findFirst({
      where: { id: args.reasonId, companyId: args.companyId },
      select: { id: true, kind: true, defaultPoints: true },
    }),
  ]);
  if (!student) throw new MeritError("That pupil is not on this school's roll.");
  if (!reason) throw new MeritError("That is not one of this school's reasons.");
  // The refusal the spec names and the artboard does not draw: a demerit
  // without a reason is a punishment nobody can explain a term later. The
  // reason is required by the signature, and this stops a merit reason being
  // used for a demerit and the ledger reading as though the school rewards
  // lateness.
  if (reason.kind !== args.kind) {
    throw new MeritError(
      args.kind === "DEMERIT"
        ? "That reason is a merit reason. Pick a reason a demerit is given for."
        : "That reason is a demerit reason. Pick a reason a merit is given for.",
    );
  }

  return prisma.schoolMeritEntry.create({
    data: {
      companyId: args.companyId,
      studentId: args.studentId,
      termId: args.termId,
      kind: args.kind,
      reasonId: reason.id,
      points: args.points ?? reason.defaultPoints,
      note: args.note?.trim() || null,
      awardedByUserId: args.actorId,
    },
    select: { id: true, kind: true, points: true },
  });
}

/**
 * Take a merit point back.
 *
 * A stamp, not a delete. Merit points are the thing in a school most often
 * recorded against the wrong child, and a deleted row tells a parent asking
 * about prize giving nothing. The entry stays, stops counting, and says who
 * reversed it and why.
 */
export async function reverseMeritEntry(args: {
  companyId: string;
  actorId: string;
  entryId: string;
  reason: string;
}) {
  const entry = await prisma.schoolMeritEntry.findFirst({
    where: { id: args.entryId, companyId: args.companyId },
    select: { id: true, reversedAt: true, studentId: true, kind: true, points: true },
  });
  if (!entry) throw new MeritError("That entry is not in this school's ledger.");
  if (entry.reversedAt) throw new MeritError("That entry has already been reversed.");
  if (!args.reason.trim()) {
    throw new MeritError("Say why it is being taken back — the pupil will be told something.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolMeritEntry.update({
      where: { id: entry.id },
      data: {
        reversedAt: new Date(),
        reversedByUserId: args.actorId,
        reversalReason: args.reason.trim(),
      },
      select: { id: true, reversedAt: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.conduct.merit.reversed",
      entityType: "SchoolMeritEntry",
      entityId: entry.id,
      reason: args.reason.trim(),
      payload: { studentId: entry.studentId, kind: entry.kind, points: entry.points },
    });
    return updated;
  });
}

/** One pupil's ledger, for the row that opens it. */
export async function pupilMeritLedger(args: {
  companyId: string;
  studentId: string;
  termId?: string;
}) {
  return prisma.schoolMeritEntry.findMany({
    where: {
      companyId: args.companyId,
      studentId: args.studentId,
      ...(args.termId ? { termId: args.termId } : {}),
    },
    select: {
      id: true,
      kind: true,
      points: true,
      note: true,
      awardedAt: true,
      awardedByUserId: true,
      reversedAt: true,
      reversalReason: true,
      reason: { select: { name: true } },
      incidentId: true,
    },
    orderBy: { awardedAt: "desc" },
  });
}

export async function meritReasons(companyId: string, kind?: SchoolMeritKind) {
  return prisma.schoolMeritReason.findMany({
    where: { companyId, isActive: true, ...(kind ? { kind } : {}) },
    select: { id: true, code: true, name: true, kind: true, defaultPoints: true },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}
