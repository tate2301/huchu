/**
 * Server-side plumbing the boarding roll-call and sick-bay routes share.
 *
 * The decisions live in `boarding-roll-call.ts`, which is pure and knows
 * nothing about the database. This file is the half that talks to Prisma:
 * finding the term, reading who the gate and the sick bay already account for,
 * and opening a night's register exactly once.
 *
 * It is deliberately thin. Anything that could be decided from values alone
 * belongs next door where it can be tested without a database.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  canSubmit,
  openingStatus,
  rollCallDate,
  rollCallSummary,
  tally,
  type RollCallTally,
} from "@/lib/schools/boarding-roll-call";

/** Raised for the refusals these helpers can state better than the route can. */
export class BoardingSessionError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "BoardingSessionError";
    this.status = status;
  }
}

/**
 * An allocation is only live while it is ACTIVE *and* unended.
 *
 * Same pair as `lib/schools/boarding.ts`. A child whose allocation was ended
 * mid-term has left the house, and counting them at lights-out would put a name
 * on the register that nobody can drive to zero.
 */
const LIVE = { status: "ACTIVE" as const, endDate: null };

/**
 * The term a boarding action belongs to.
 *
 * An explicit id wins; otherwise the school's active term. Refused rather than
 * guessed when there is none — writing a roll call against the wrong term makes
 * it invisible to the screen that asks for it back.
 */
export async function resolveTermId(
  companyId: string,
  termId?: string | null,
): Promise<string> {
  if (termId) {
    const term = await prisma.schoolTerm.findFirst({
      where: { id: termId, companyId },
      select: { id: true },
    });
    if (!term) throw new BoardingSessionError("Term not found", 404);
    return term.id;
  }

  const active = await prisma.schoolTerm.findFirst({
    where: { companyId, isActive: true },
    select: { id: true },
    orderBy: { startDate: "desc" },
  });
  if (!active) {
    throw new BoardingSessionError(
      "No active term — set one before taking a roll call",
      400,
    );
  }
  return active.id;
}

/**
 * The children the gate says are out, and the ones the sick bay has.
 *
 * Read together because `openingStatus` needs both and asking for them at two
 * different moments is how a child signed out between the two queries opens as
 * NOT_SEEN.
 */
export async function accountedForElsewhere(companyId: string): Promise<{
  signedOutStudentIds: Set<string>;
  sickBayStudentIds: Set<string>;
}> {
  const [signedOut, sickBay] = await Promise.all([
    prisma.schoolLeaveRequest.findMany({
      where: { companyId, status: "CHECKED_OUT" },
      select: { studentId: true },
    }),
    prisma.schoolSickBayAdmission.findMany({
      where: { companyId, dischargedAt: null },
      select: { studentId: true },
    }),
  ]);

  return {
    signedOutStudentIds: new Set(signedOut.map((row) => row.studentId)),
    sickBayStudentIds: new Set(sickBay.map((row) => row.studentId)),
  };
}

export const rollCallInclude = {
  hostel: { select: { id: true, code: true, name: true } },
  term: { select: { id: true, code: true, name: true } },
  takenBy: { select: { id: true, name: true, email: true } },
  entries: {
    include: {
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          isPrefect: true,
        },
      },
    },
    orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
  },
} satisfies Prisma.SchoolRollCallInclude;

type RollCallWithEntries = Prisma.SchoolRollCallGetPayload<{
  include: typeof rollCallInclude;
}>;

/**
 * A roll call as the screen wants it: the record, the counts, and the sentence.
 *
 * The tally and the summary are computed here rather than in the component so
 * the house page, the roll-call page and any report say the same thing about
 * the same night.
 */
export function presentRollCall(rollCall: RollCallWithEntries) {
  const statuses = rollCall.entries.map((entry) => entry.status);
  const counts: RollCallTally = tally(statuses);
  return {
    ...rollCall,
    tally: counts,
    summary: rollCallSummary(counts),
    canSubmit: canSubmit(statuses) && rollCall.status === "OPEN",
  };
}

export async function findRollCall(
  companyId: string,
  id: string,
): Promise<RollCallWithEntries | null> {
  return prisma.schoolRollCall.findFirst({
    where: { id, companyId },
    include: rollCallInclude,
  });
}

/**
 * Open tonight's register for a house, or hand back the one already open.
 *
 * ## Why this is not a create
 *
 * Two wardens open the same screen; the screen is refreshed; a phone comes back
 * from sleep. Every one of those is a second POST, and every one of them must
 * land on the same register — a house with two registers for one night cannot
 * answer the only question a roll call exists to answer.
 *
 * The unique index on `(companyId, hostelId, takenOn, session)` is what makes
 * that true under a race. The read below is the fast path; the catch is the
 * correct one.
 *
 * ## Why the seed matters
 *
 * Entries are created with `openingStatus`, not with the NOT_SEEN default. A
 * child the school already knows is at home on an exeat, or two doors away in
 * the sick bay, is not a child the warden failed to find, and making somebody
 * tick past them is exactly how the count stops being a check.
 */
export async function openOrGetRollCall(input: {
  companyId: string;
  hostelId: string;
  termId?: string | null;
  session: "MORNING" | "EVENING";
  takenOn?: Date;
  takenById: string;
}): Promise<{ rollCall: RollCallWithEntries; created: boolean }> {
  const { companyId, hostelId, takenById } = input;
  const takenOn = rollCallDate(input.takenOn ?? new Date());
  const rollCallSession = input.session;

  const key = {
    companyId_hostelId_takenOn_session: {
      companyId,
      hostelId,
      takenOn,
      session: rollCallSession,
    },
  };

  const existing = await prisma.schoolRollCall.findUnique({
    where: key,
    include: rollCallInclude,
  });
  if (existing) return { rollCall: existing, created: false };

  const hostel = await prisma.schoolHostel.findFirst({
    where: { id: hostelId, companyId },
    select: { id: true },
  });
  if (!hostel) throw new BoardingSessionError("Hostel not found", 404);

  const termId = await resolveTermId(companyId, input.termId);

  const [allocations, elsewhere] = await Promise.all([
    prisma.schoolBoardingAllocation.findMany({
      where: { companyId, hostelId, termId, ...LIVE },
      select: { studentId: true, bedId: true },
    }),
    accountedForElsewhere(companyId),
  ]);

  try {
    await prisma.schoolRollCall.create({
      data: {
        companyId,
        hostelId,
        termId,
        takenOn,
        session: rollCallSession,
        status: "OPEN",
        takenById,
        entries: {
          create: allocations.map((allocation) => ({
            companyId,
            studentId: allocation.studentId,
            bedId: allocation.bedId,
            status: openingStatus({
              studentId: allocation.studentId,
              signedOutStudentIds: elsewhere.signedOutStudentIds,
              sickBayStudentIds: elsewhere.sickBayStudentIds,
            }),
          })),
        },
      },
      select: { id: true },
    });
  } catch (error) {
    // Somebody else opened the same night between the read and this write.
    // Their register is the register — return it rather than failing a warden
    // who did nothing wrong.
    if (!isUniqueViolation(error)) throw error;
  }

  const rollCall = await prisma.schoolRollCall.findUnique({
    where: key,
    include: rollCallInclude,
  });
  if (!rollCall) {
    throw new BoardingSessionError("Could not open the roll call", 500);
  }
  return { rollCall, created: true };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: string }).code === "P2002";
}

export const sickBayInclude = {
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      gender: true,
    },
  },
  term: { select: { id: true, code: true, name: true } },
  bed: { select: { id: true, code: true, bay: true, tier: true } },
  admittedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.SchoolSickBayAdmissionInclude;

/**
 * The bed a boarder holds while they are in the sick bay.
 *
 * Read for display only. Nothing in the sick-bay routes writes to an
 * allocation — holding the bed *is* the design, and the moment an admission
 * starts ending allocations the placer hands the bed to somebody else while its
 * owner is two doors away with a temperature.
 */
export async function heldBeds(
  companyId: string,
  studentIds: readonly string[],
): Promise<Map<string, { hostelName: string; bedCode: string | null }>> {
  if (studentIds.length === 0) return new Map();

  const allocations = await prisma.schoolBoardingAllocation.findMany({
    where: { companyId, studentId: { in: [...studentIds] }, ...LIVE },
    select: {
      studentId: true,
      hostel: { select: { name: true } },
      bed: { select: { code: true } },
    },
  });

  return new Map(
    allocations.map((allocation) => [
      allocation.studentId,
      {
        hostelName: allocation.hostel.name,
        bedCode: allocation.bed?.code ?? null,
      },
    ]),
  );
}
