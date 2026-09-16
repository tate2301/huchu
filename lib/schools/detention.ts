import { SchoolDetentionState } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getsHomeForMany, type GetsHome } from "@/lib/schools/gets-home";

/**
 * The detention register.
 *
 * Built for somebody standing up: Farai Moyo at 14:03 on a Friday in Room 12
 * with a phone, marking twelve names while the R2 idles outside.
 *
 * Two rules the numbers depend on, and both are the point rather than details:
 *
 *   - **`Did not turn up` does not decrement what is owed.** A pupil who was
 *     named and did not come still owes the session. That is the whole reason
 *     `Still to serve` is a column on the register and totalled at its foot,
 *     rather than a second list of the same eleven names.
 *   - **A moved row cannot be marked present.** You cannot be here at a session
 *     you are not serving, and the screen enforces that by not offering the
 *     verb — so `markEveryoneHere` must skip them.
 */

export class DetentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetentionError";
  }
}

/**
 * The tenant boundary, thrown where an id that arrived in a request is not this
 * school's.
 *
 * A subclass rather than a class of its own, so the routes that already answer
 * `DetentionError` with a 422 keep catching it untouched, and a route that
 * needs the distinction can make it: "there is no such sitting here" is a 404
 * and is not the same answer as "you cannot do that to this one".
 */
export class DetentionNotFoundError extends DetentionError {
  constructor(message: string) {
    super(message);
    this.name = "DetentionNotFoundError";
  }
}

export type SessionSummary = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  label: string | null;
  room: { id: string; code: string; name: string } | null;
  supervisor: { id: string; name: string | null; employeeCode: string } | null;
  /** How many are named on it. */
  named: number;
  /** Named on this session but serving elsewhere. */
  movedAway: number;
  /** Moved here from another session — the badge `Moved here from today`. */
  movedHere: number;
  /** True where nobody is supervising it yet. Drawn in red. */
  needsSupervisor: boolean;
};

const SESSION_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  label: true,
  room: { select: { id: true, code: true, name: true } },
  supervisor: {
    select: {
      id: true,
      employeeCode: true,
      user: { select: { name: true, email: true } },
    },
  },
  _count: { select: { attendance: true, movedIn: true } },
} as const;

function toSummary(
  session: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    label: string | null;
    room: { id: string; code: string; name: string } | null;
    supervisor: {
      id: string;
      employeeCode: string;
      user: { name: string | null; email: string } | null;
    } | null;
    _count: { attendance: number; movedIn: number };
  },
  movedAway: number,
): SessionSummary {
  return {
    id: session.id,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    label: session.label,
    room: session.room,
    supervisor: session.supervisor
      ? {
          id: session.supervisor.id,
          name: session.supervisor.user?.name ?? session.supervisor.user?.email ?? null,
          employeeCode: session.supervisor.employeeCode,
        }
      : null,
    named: session._count.attendance,
    movedAway,
    movedHere: session._count.movedIn,
    needsSupervisor: session.supervisor == null,
  };
}

/** The coming sessions, with what each one still needs. */
export async function detentionSessions(args: {
  companyId: string;
  termId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<SessionSummary[]> {
  const sessions = await prisma.schoolDetentionSession.findMany({
    where: {
      companyId: args.companyId,
      ...(args.termId ? { termId: args.termId } : {}),
      ...(args.from || args.to
        ? { startsAt: { ...(args.from ? { gte: args.from } : {}), ...(args.to ? { lte: args.to } : {}) } }
        : {}),
    },
    select: SESSION_SELECT,
    orderBy: { startsAt: "asc" },
    take: args.limit ?? 40,
  });
  if (sessions.length === 0) return [];
  const moved = await prisma.schoolDetentionAttendance.groupBy({
    by: ["sessionId"],
    where: {
      companyId: args.companyId,
      sessionId: { in: sessions.map((session) => session.id) },
      state: "MOVED",
    },
    _count: { _all: true },
  });
  const movedBySession = new Map(moved.map((row) => [row.sessionId, row._count._all]));
  return sessions.map((session) => toSummary(session, movedBySession.get(session.id) ?? 0));
}

export type RegisterRow = {
  attendanceId: string;
  state: SchoolDetentionState;
  markedAt: Date | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    // The ids as well as the names: the screen's class filter hands back ids,
    // and a filter that compared names would narrow by a label two classes can
    // share.
    classId: string | null;
    className: string | null;
    streamId: string | null;
    streamName: string | null;
  };
  /** `Disruption — sent out of Combined Science, 1 Sep`. */
  servingFor: string;
  /** `1 of 2` — the numerator is this session's place in what was awarded. */
  session: { index: number; owed: number };
  getsHome: GetsHome;
  /** `1 more · Fri 11 Sep`, or nothing left to serve. */
  stillToServe: { sessions: number; nextAt: Date | null };
  movedTo: { id: string; startsAt: Date } | null;
};

export type SessionRegister = {
  session: SessionSummary;
  rows: RegisterRow[];
  chips: {
    /** Named for this session and not moved elsewhere. */
    dueHere: number;
    here: number;
    notMarked: number;
    movedAway: number;
  };
  /** The total at the foot: `6 sessions · 5 pupils`. */
  stillToServeAfterToday: { sessions: number; pupils: number };
  /**
   * The bus conflict, where there is one. Absent until it is known — the alert
   * must not render a skeleton of itself.
   */
  busConflict: {
    routeCode: string;
    students: Array<{ id: string; firstName: string; lastName: string }>;
  } | null;
};

/**
 * One session's register, and everything the screen draws from it.
 *
 * `Still to serve` is `sessionsOwed` minus the pupil's `HERE` count across every
 * session — not minus the marks on this one. A pupil serving the second of
 * three still owes one after today, and that is the number the foot totals.
 */
export async function sessionRegister(args: {
  companyId: string;
  sessionId: string;
}): Promise<SessionRegister> {
  const session = await prisma.schoolDetentionSession.findFirst({
    where: { id: args.sessionId, companyId: args.companyId },
    select: { ...SESSION_SELECT, termId: true },
  });
  if (!session) throw new DetentionError("That detention session is not this school's.");

  const attendance = await prisma.schoolDetentionAttendance.findMany({
    where: { companyId: args.companyId, sessionId: session.id },
    select: {
      id: true,
      state: true,
      markedAt: true,
      movedTo: { select: { id: true, startsAt: true } },
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          currentClass: { select: { id: true, name: true } },
          currentStream: { select: { id: true, name: true } },
        },
      },
      award: {
        select: {
          id: true,
          sessionsOwed: true,
          reason: true,
          awardedAt: true,
          incident: {
            select: {
              summary: true,
              occurredAt: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { student: { lastName: "asc" } },
  });

  const studentIds = attendance.map((row) => row.student.id);
  const [getsHome, servedByAward, upcoming] = await Promise.all([
    getsHomeForMany({ companyId: args.companyId, studentIds, termId: session.termId }),
    prisma.schoolDetentionAttendance.groupBy({
      by: ["awardId"],
      where: {
        companyId: args.companyId,
        awardId: { in: attendance.map((row) => row.award.id) },
        state: "HERE",
      },
      _count: { _all: true },
    }),
    // The sessions after this one, so `1 more · Fri 11 Sep` can name a date
    // rather than a count on its own.
    prisma.schoolDetentionAttendance.findMany({
      where: {
        companyId: args.companyId,
        studentId: { in: studentIds },
        state: "NOT_MARKED",
        session: { startsAt: { gt: session.startsAt } },
      },
      select: { studentId: true, session: { select: { startsAt: true } } },
      orderBy: { session: { startsAt: "asc" } },
    }),
  ]);

  const servedCount = new Map(servedByAward.map((row) => [row.awardId, row._count._all]));
  const nextByStudent = new Map<string, Date>();
  for (const row of upcoming) {
    if (!nextByStudent.has(row.studentId)) nextByStudent.set(row.studentId, row.session.startsAt);
  }
  // Which of this session's marks is this pupil's nth. The award carries the
  // denominator; this is the numerator.
  const indexByAward = new Map<string, number>();
  for (const row of attendance) {
    const served = servedCount.get(row.award.id) ?? 0;
    indexByAward.set(row.award.id, row.state === "HERE" ? served : served + 1);
  }

  const rows: RegisterRow[] = attendance.map((row) => {
    const served = servedCount.get(row.award.id) ?? 0;
    const owed = row.award.sessionsOwed;
    const servingFor = row.award.incident
      ? `${row.award.incident.category.name} — ${row.award.incident.summary}`
      : (row.award.reason ?? "Not recorded");
    return {
      attendanceId: row.id,
      state: row.state,
      markedAt: row.markedAt,
      student: {
        id: row.student.id,
        studentNo: row.student.studentNo,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
        classId: row.student.currentClass?.id ?? null,
        className: row.student.currentClass?.name ?? null,
        streamId: row.student.currentStream?.id ?? null,
        streamName: row.student.currentStream?.name ?? null,
      },
      servingFor,
      session: { index: Math.min(indexByAward.get(row.award.id) ?? 1, owed), owed },
      getsHome: getsHome.get(row.student.id) ?? { kind: "day", label: "Day" },
      stillToServe: {
        // `served` is every HERE mark against this award, today's included once
        // it is marked, so the subtraction already accounts for this session and
        // needs no correction term. There was one here — `- (state === "HERE" ?
        // 0 : 0)` — which subtracted nothing down either branch and read as if a
        // correction were being applied. Making it `? 1 : 0` would have counted
        // today twice.
        sessions: Math.max(0, owed - served),
        nextAt: nextByStudent.get(row.student.id) ?? null,
      },
      movedTo: row.movedTo,
    };
  });

  const movedAway = rows.filter((row) => row.state === "MOVED");
  const here = rows.filter((row) => row.state === "HERE");
  const notMarked = rows.filter((row) => row.state === "NOT_MARKED");
  const didNotTurnUp = rows.filter((row) => row.state === "DID_NOT_TURN_UP");

  // What is owed after today: the sessions still to serve for everybody on this
  // register, and how many pupils that is. `6 sessions · 5 pupils`.
  const owedAfterToday = rows.filter((row) => row.stillToServe.sessions > 0);
  const stillToServeAfterToday = {
    sessions: owedAfterToday.reduce((total, row) => total + row.stillToServe.sessions, 0),
    pupils: new Set(owedAfterToday.map((row) => row.student.id)).size,
  };

  // The bus conflict: pupils on a route who are due at a session that has not
  // finished by the time the bus goes. The register cannot know the timetable
  // of every route, so the rule is the one a school states — the bus leaves
  // before the session ends — and it is only drawn when both facts are known.
  const busRiders = rows.filter(
    (row) => row.getsHome.kind === "bus" && row.state === "MOVED",
  );
  const busConflict = busRiders.length
    ? {
        routeCode:
          busRiders[0].getsHome.kind === "bus" ? busRiders[0].getsHome.routeCode : "",
        students: busRiders.map((row) => ({
          id: row.student.id,
          firstName: row.student.firstName,
          lastName: row.student.lastName,
        })),
      }
    : null;

  return {
    session: toSummary(session, movedAway.length),
    rows,
    chips: {
      dueHere: here.length + notMarked.length + didNotTurnUp.length,
      here: here.length,
      notMarked: notMarked.length,
      movedAway: movedAway.length,
    },
    stillToServeAfterToday,
    busConflict,
  };
}

/** Mark one pupil. */
export async function markAttendance(args: {
  companyId: string;
  actorId: string;
  /**
   * The session being marked, from the URL.
   *
   * Required, and it is the whole point. The route proves the caller supervises
   * THIS session and then used to pass an `attendanceId` scoped only to the
   * company — so a teacher supervising Friday's detention could mark a row on
   * Saturday's register, or on any other session in the school, by sending its
   * id. The gate and the write have to be about the same sitting.
   */
  sessionId: string;
  attendanceId: string;
  state: "HERE" | "DID_NOT_TURN_UP" | "NOT_MARKED";
}) {
  const row = await prisma.schoolDetentionAttendance.findFirst({
    where: { id: args.attendanceId, companyId: args.companyId, sessionId: args.sessionId },
    select: { id: true, state: true },
  });
  if (!row) throw new DetentionError("That name is not on this register.");
  // The refusal the screen draws as a state: a moved row carries no `Here`
  // button, because you cannot be present at a session you are not serving.
  if (row.state === "MOVED") {
    throw new DetentionError(
      "That pupil is serving another session, so they cannot be marked here. Move them back first.",
    );
  }
  return prisma.schoolDetentionAttendance.update({
    where: { id: row.id },
    data: {
      state: args.state,
      markedAt: args.state === "NOT_MARKED" ? null : new Date(),
      markedByUserId: args.state === "NOT_MARKED" ? null : args.actorId,
    },
    select: { id: true, state: true, markedAt: true },
  });
}

/**
 * Mark everybody who is here.
 *
 * Skips the moved rows, which is the third refusal the spec asks for and the
 * artboard does not draw. Where every remaining row is moved there is nothing
 * to mark, and saying so is better than reporting a success that changed
 * nothing.
 */
export async function markEveryoneHere(args: {
  companyId: string;
  actorId: string;
  sessionId: string;
}) {
  const unmarked = await prisma.schoolDetentionAttendance.findMany({
    where: { companyId: args.companyId, sessionId: args.sessionId, state: "NOT_MARKED" },
    select: { id: true },
  });
  if (unmarked.length === 0) {
    const moved = await prisma.schoolDetentionAttendance.count({
      where: { companyId: args.companyId, sessionId: args.sessionId, state: "MOVED" },
    });
    throw new DetentionError(
      moved > 0
        ? "Everybody left on this register is serving another session, so there is nobody here to mark."
        : "Everybody on this register has already been marked.",
    );
  }
  const now = new Date();
  const result = await prisma.schoolDetentionAttendance.updateMany({
    where: { id: { in: unmarked.map((row) => row.id) } },
    data: { state: "HERE", markedAt: now, markedByUserId: args.actorId },
  });
  return { marked: result.count };
}

/** Move a pupil to another session — the bus at 14:10. */
export async function moveToSession(args: {
  companyId: string;
  actorId: string;
  /** The session being marked, from the URL. See `markAttendance`. */
  sessionId: string;
  attendanceId: string;
  toSessionId: string;
}) {
  const [row, target] = await Promise.all([
    prisma.schoolDetentionAttendance.findFirst({
      where: { id: args.attendanceId, companyId: args.companyId, sessionId: args.sessionId },
      select: { id: true, state: true, awardId: true, studentId: true, sessionId: true },
    }),
    prisma.schoolDetentionSession.findFirst({
      where: { id: args.toSessionId, companyId: args.companyId },
      select: { id: true },
    }),
  ]);
  if (!row) throw new DetentionError("That name is not on this register.");
  if (!target) throw new DetentionError("That is not one of this school's sessions.");
  if (row.sessionId === target.id) {
    throw new DetentionError("That is the session they are already named on.");
  }
  if (row.state === "HERE") {
    throw new DetentionError("They have already served this one, so there is nothing to move.");
  }

  return prisma.$transaction(async (tx) => {
    const moved = await tx.schoolDetentionAttendance.update({
      where: { id: row.id },
      data: { state: "MOVED", movedToSessionId: target.id },
      select: { id: true },
    });
    // The pupil has to be named on the session they are actually serving, or
    // Saturday's supervisor gets a register that does not include them.
    const already = await tx.schoolDetentionAttendance.findFirst({
      where: { sessionId: target.id, awardId: row.awardId },
      select: { id: true },
    });
    if (!already) {
      await tx.schoolDetentionAttendance.create({
        data: {
          companyId: args.companyId,
          sessionId: target.id,
          awardId: row.awardId,
          studentId: row.studentId,
          state: "NOT_MARKED",
        },
      });
    }
    return moved;
  });
}

/** Schedule a session. */
export async function createSession(args: {
  companyId: string;
  termId: string;
  startsAt: Date;
  endsAt: Date;
  roomId?: string | null;
  supervisorTeacherProfileId?: string | null;
  label?: string | null;
}) {
  return prisma.schoolDetentionSession.create({
    data: {
      companyId: args.companyId,
      termId: args.termId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      roomId: args.roomId ?? null,
      supervisorTeacherProfileId: args.supervisorTeacherProfileId ?? null,
      label: args.label?.trim() || null,
    },
    select: { id: true },
  });
}

/**
 * Move a sitting, or change who is standing at the front of it.
 *
 * A school books Friday detention into the hall in week two. In week five the
 * hall is wanted for prize-giving, the teacher supervising it is away, and the
 * whole thing has to become Monday. None of that was possible: the date, the
 * room and the supervisor were settled at the moment the sitting was created
 * and nothing in the product could reach them again, so a school's only way out
 * was to schedule a second sitting beside the first and leave everybody named
 * on a register that would never be taken.
 *
 * The room and the supervisor arrive as ids in a request body, so both are
 * resolved against the caller's own company before either is written —
 * otherwise a school could book another school's room, and the register would
 * print a stranger as the person in charge of its pupils.
 */
export async function updateSession(args: {
  companyId: string;
  sessionId: string;
  startsAt?: Date;
  endsAt?: Date;
  roomId?: string | null;
  supervisorTeacherProfileId?: string | null;
  label?: string | null;
}) {
  const existing = await prisma.schoolDetentionSession.findFirst({
    where: { id: args.sessionId, companyId: args.companyId },
    select: { id: true, startsAt: true, endsAt: true },
  });
  if (!existing) throw new DetentionNotFoundError("That detention session is not this school's.");

  // Measured against what the sitting will be, not against what was sent. A
  // correction that moves only the end time has to be checked against the start
  // time already stored, or 14:00–15:00 could be given an end of 13:30 by a
  // request that never mentioned the start.
  const startsAt = args.startsAt ?? existing.startsAt;
  const endsAt = args.endsAt ?? existing.endsAt;
  if (endsAt <= startsAt) throw new DetentionError("A session has to end after it starts.");

  const [room, supervisor] = await Promise.all([
    args.roomId
      ? prisma.schoolRoom.findFirst({
          where: { id: args.roomId, companyId: args.companyId },
          select: { id: true },
        })
      : Promise.resolve(null),
    args.supervisorTeacherProfileId
      ? prisma.schoolTeacherProfile.findFirst({
          where: { id: args.supervisorTeacherProfileId, companyId: args.companyId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (args.roomId && !room) throw new DetentionError("That room is not this school's.");
  if (args.supervisorTeacherProfileId && !supervisor) {
    throw new DetentionError("That teacher is not on this school's staff.");
  }

  return prisma.schoolDetentionSession.update({
    where: { id: existing.id },
    data: {
      ...(args.startsAt !== undefined ? { startsAt: args.startsAt } : {}),
      ...(args.endsAt !== undefined ? { endsAt: args.endsAt } : {}),
      // An explicit `null` gives the room back and takes the supervisor's name
      // off; a field nobody mentioned is left where it was. Collapsing the two
      // would mean a school could name a supervisor and never unname one, and
      // would rub out the room every time somebody corrected the label.
      ...(args.roomId !== undefined ? { roomId: args.roomId } : {}),
      ...(args.supervisorTeacherProfileId !== undefined
        ? { supervisorTeacherProfileId: args.supervisorTeacherProfileId }
        : {}),
      ...(args.label !== undefined ? { label: args.label?.trim() || null } : {}),
    },
    select: { id: true },
  });
}

/**
 * Call a sitting off.
 *
 * `SchoolDetentionSession` carries no cancelled state, and this does not invent
 * one in a column that does not exist. So the rule is the one the rows
 * themselves decide:
 *
 *   - **nobody named: it goes.** A sitting in the diary that no pupil owes is a
 *     booking, not a record. Nothing points at it and deleting it takes no
 *     meaning away from anything.
 *   - **anybody named: it stays, and the refusal says how many.** Those pupils
 *     were told to attend, their awards count this sitting towards what they
 *     owe, and `Moved to Saturday` on another register is a pointer at this row
 *     that `onDelete: SetNull` would quietly blank — the badge would degrade to
 *     `Moved elsewhere` and a supervisor would have no register to go and look
 *     at. Move the awards to another sitting first; once the last one is off
 *     it, this becomes the empty case above.
 *
 * A session people were moved *into* always holds rows of its own, because
 * `moveToSession` names the pupil on the sitting they are actually serving. So
 * the one count below covers the moved-in pointers too.
 */
export async function cancelSession(args: { companyId: string; sessionId: string }) {
  const session = await prisma.schoolDetentionSession.findFirst({
    where: { id: args.sessionId, companyId: args.companyId },
    select: { id: true, _count: { select: { attendance: true } } },
  });
  if (!session) throw new DetentionNotFoundError("That detention session is not this school's.");

  const named = session._count.attendance;
  if (named > 0) {
    throw new DetentionError(
      named === 1
        ? "One pupil is named on this session and was told to attend it. Move them to another session first, then this one can be called off."
        : `${named} pupils are named on this session and were told to attend it. Move them to another session first, then this one can be called off.`,
    );
  }

  await prisma.schoolDetentionSession.delete({ where: { id: session.id } });
  return { id: session.id };
}

/**
 * Award detention, and name the pupil on the sessions they will serve.
 *
 * The award carries how many; the register rows are what a supervisor reads.
 * Both are written here so a pupil who owes two Fridays appears on two
 * registers rather than on one with a number beside it.
 */
export async function awardDetention(args: {
  companyId: string;
  actorId: string;
  termId: string;
  studentId: string;
  incidentId?: string | null;
  reason?: string | null;
  sessionsOwed: number;
  sessionIds: string[];
}) {
  if (args.sessionsOwed < 1) throw new DetentionError("A detention is at least one session.");
  if (args.sessionIds.length === 0) {
    throw new DetentionError("Name the session they are serving, or the register has nobody on it.");
  }
  /*
    The sittings were checked and the pupil was not.

    `studentId` and `incidentId` both arrive in a request body. Unchecked, a
    caller could put another school's pupil on this school's detention
    register — and because the register is read back with the incident summary
    attached, that also hands over a line of another school's behaviour log.
  */
  const [sessions, student, incident] = await Promise.all([
    prisma.schoolDetentionSession.findMany({
      where: { companyId: args.companyId, id: { in: args.sessionIds } },
      select: { id: true },
    }),
    prisma.schoolStudent.findFirst({
      where: { id: args.studentId, companyId: args.companyId },
      select: { id: true },
    }),
    args.incidentId
      ? prisma.schoolConductIncident.findFirst({
          where: { id: args.incidentId, companyId: args.companyId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (sessions.length !== args.sessionIds.length) {
    throw new DetentionError("One of those sessions is not this school's.");
  }
  if (!student) {
    throw new DetentionError("That pupil is not on this school's roll.");
  }
  if (args.incidentId && !incident) {
    throw new DetentionError("That incident is not on this school's log.");
  }

  return prisma.$transaction(async (tx) => {
    const award = await tx.schoolDetentionAward.create({
      data: {
        companyId: args.companyId,
        termId: args.termId,
        studentId: args.studentId,
        incidentId: args.incidentId ?? null,
        reason: args.reason?.trim() || null,
        sessionsOwed: args.sessionsOwed,
        awardedByUserId: args.actorId,
      },
      select: { id: true },
    });
    for (const session of sessions) {
      await tx.schoolDetentionAttendance.create({
        data: {
          companyId: args.companyId,
          sessionId: session.id,
          awardId: award.id,
          studentId: args.studentId,
          state: "NOT_MARKED",
        },
      });
    }
    return award;
  });
}

/**
 * What one pupil owes and has served — the incident page's `Served` chip and
 * its `Next detention`.
 *
 * One helper, so the chip and the review spine cannot disagree about the same
 * two numbers. `conduct.md` open question 5 is exactly that disagreement drawn
 * four inches apart on one artboard.
 */
export async function detentionStandingFor(args: {
  companyId: string;
  studentId: string;
  incidentId?: string;
}): Promise<{
  owed: number;
  served: number;
  nextSession: { id: string; startsAt: Date; roomName: string | null; supervisorName: string | null } | null;
}> {
  const awards = await prisma.schoolDetentionAward.findMany({
    where: {
      companyId: args.companyId,
      studentId: args.studentId,
      ...(args.incidentId ? { incidentId: args.incidentId } : {}),
    },
    select: {
      sessionsOwed: true,
      attendance: {
        select: {
          state: true,
          session: {
            select: {
              id: true,
              startsAt: true,
              room: { select: { name: true } },
              supervisor: { select: { user: { select: { name: true, email: true } } } },
            },
          },
        },
        orderBy: { session: { startsAt: "asc" } },
      },
    },
  });

  const owed = awards.reduce((total, award) => total + award.sessionsOwed, 0);
  const served = awards.reduce(
    (total, award) => total + award.attendance.filter((row) => row.state === "HERE").length,
    0,
  );
  const now = new Date();
  const next = awards
    .flatMap((award) => award.attendance)
    .filter((row) => row.state === "NOT_MARKED" && row.session.startsAt >= now)
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime())[0];

  return {
    owed,
    served,
    nextSession: next
      ? {
          id: next.session.id,
          startsAt: next.session.startsAt,
          roomName: next.session.room?.name ?? null,
          supervisorName:
            next.session.supervisor?.user?.name ?? next.session.supervisor?.user?.email ?? null,
        }
      : null,
  };
}
