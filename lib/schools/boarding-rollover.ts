/**
 * Carrying boarding from one term into the next.
 *
 * ## Why this exists
 *
 * A boarding allocation is scoped to a term. Without a rollover, the first day
 * of Term 2 has an empty bed board and a warden retyping two hundred children
 * by hand — which is the point at which a school stops using the system and
 * goes back to the paper plan on the office wall.
 *
 * Two moves, deliberately separate:
 *
 * - **Close** a term: every ACTIVE allocation becomes ENDED with an end date.
 *   The beds are free, and last term's occupancy survives as history — which is
 *   the half that matters when somebody asks in March who slept in bed 12 in
 *   October.
 * - **Open** a term: every child who boarded last term and is still enrolled
 *   gets the same bed again.
 *
 * ## Both are previewed before they are written
 *
 * Neither function writes. Each returns a plan the caller shows the warden, who
 * commits it. A mass allocation nobody saw before it ran is how a school loses
 * a term of data, and "it was only a button" is how it gets explained
 * afterwards.
 *
 * ## What carrying over deliberately does NOT do
 *
 * It does not invent a bed for a child who did not have one, and it does not
 * move anybody. A child whose bed is now out of service, or whose house no
 * longer takes their sex because the school reorganised, comes back as
 * `needsPlacing` rather than being quietly put somewhere else. The warden
 * places those by hand on the allocations screen, which is a short list and a
 * decision a person should make.
 */

import type { PrismaClient } from "@prisma/client";

import { normaliseGender } from "@/lib/schools/boarding-rules";

export type RolloverCandidate = {
  studentId: string;
  studentNo: string;
  name: string;
  hostelId: string;
  hostelName: string;
  roomId: string | null;
  bedId: string | null;
  bedCode: string | null;
};

export type RolloverPlan = {
  fromTermId: string;
  toTermId: string;
  /** Children who get their old bed back, unchanged. */
  carriedOver: RolloverCandidate[];
  /**
   * Children who boarded last term and still need a bed this term, with the
   * reason their old one is not available. These are a worklist, not a failure.
   */
  needsPlacing: Array<RolloverCandidate & { why: string }>;
  /**
   * Children who boarded last term and are not coming back — left the school,
   * or are no longer marked as boarding. Named so the warden can see the roll
   * shrink on purpose rather than wonder where twelve pupils went.
   */
  notReturning: Array<RolloverCandidate & { why: string }>;
};

/**
 * What opening `toTermId` would do, given what `fromTermId` looked like.
 *
 * Reads only. The caller commits with `applyRollover`.
 */
export async function planRollover(
  prisma: PrismaClient,
  input: { companyId: string; fromTermId: string; toTermId: string },
): Promise<RolloverPlan> {
  const { companyId, fromTermId, toTermId } = input;

  const previous = await prisma.schoolBoardingAllocation.findMany({
    where: { companyId, termId: fromTermId, status: "ACTIVE" },
    include: {
      student: true,
      hostel: true,
      bed: { include: { room: true } },
    },
  });

  // Everything already placed in the new term, so running this twice is safe.
  const already = await prisma.schoolBoardingAllocation.findMany({
    where: { companyId, termId: toTermId, status: "ACTIVE" },
    select: { studentId: true, bedId: true },
  });
  const alreadyPlaced = new Set(already.map((row) => row.studentId));
  const bedTakenInNewTerm = new Set(
    already.map((row) => row.bedId).filter((id): id is string => Boolean(id)),
  );

  const carriedOver: RolloverPlan["carriedOver"] = [];
  const needsPlacing: RolloverPlan["needsPlacing"] = [];
  const notReturning: RolloverPlan["notReturning"] = [];

  for (const allocation of previous) {
    const student = allocation.student;
    const candidate: RolloverCandidate = {
      studentId: student.id,
      studentNo: student.studentNo,
      name: `${student.firstName} ${student.lastName}`,
      hostelId: allocation.hostelId,
      hostelName: allocation.hostel.name,
      roomId: allocation.roomId,
      bedId: allocation.bedId,
      bedCode: allocation.bed?.code ?? null,
    };

    if (alreadyPlaced.has(student.id)) continue;

    if (student.status !== "ACTIVE") {
      notReturning.push({ ...candidate, why: "No longer an active pupil" });
      continue;
    }
    if (!student.isBoarding) {
      notReturning.push({ ...candidate, why: "No longer boarding" });
      continue;
    }

    if (!allocation.bedId || !allocation.bed) {
      needsPlacing.push({ ...candidate, why: "Had no specific bed last term" });
      continue;
    }
    if (allocation.bed.status !== "AVAILABLE") {
      needsPlacing.push({ ...candidate, why: "Their bed is out of service" });
      continue;
    }
    if (bedTakenInNewTerm.has(allocation.bedId)) {
      needsPlacing.push({ ...candidate, why: "Somebody else is in that bed now" });
      continue;
    }
    // The school may have re-sexed a house between terms.
    const policy = allocation.hostel.genderPolicy.toUpperCase();
    if (policy !== "MIXED" && normaliseGender(student.gender) !== policy) {
      needsPlacing.push({
        ...candidate,
        why: `${allocation.hostel.name} no longer takes them`,
      });
      continue;
    }

    carriedOver.push(candidate);
  }

  return { fromTermId, toTermId, carriedOver, needsPlacing, notReturning };
}

/**
 * Write the carry-over half of a plan.
 *
 * Only `carriedOver` is written — `needsPlacing` is a worklist for a person and
 * `notReturning` is information. One transaction, so a school either starts the
 * term with its boarding intact or with nothing half-done.
 */
export async function applyRollover(
  prisma: PrismaClient,
  input: {
    companyId: string;
    toTermId: string;
    candidates: RolloverCandidate[];
    startDate: Date;
  },
): Promise<{ created: number }> {
  const { companyId, toTermId, candidates, startDate } = input;
  if (candidates.length === 0) return { created: 0 };

  const created = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction: the preview the warden looked at may be
    // minutes old, and a bed taken in between must not be double-allocated.
    const taken = await tx.schoolBoardingAllocation.findMany({
      where: { companyId, termId: toTermId, status: "ACTIVE" },
      select: { studentId: true, bedId: true },
    });
    const placedStudents = new Set(taken.map((row) => row.studentId));
    const takenBeds = new Set(
      taken.map((row) => row.bedId).filter((id): id is string => Boolean(id)),
    );

    const rows = candidates.filter(
      (candidate) =>
        !placedStudents.has(candidate.studentId) &&
        (!candidate.bedId || !takenBeds.has(candidate.bedId)),
    );

    if (rows.length === 0) return 0;

    const result = await tx.schoolBoardingAllocation.createMany({
      data: rows.map((candidate) => ({
        companyId,
        studentId: candidate.studentId,
        termId: toTermId,
        hostelId: candidate.hostelId,
        roomId: candidate.roomId,
        bedId: candidate.bedId,
        status: "ACTIVE" as const,
        startDate,
        reason: "Carried over from the previous term",
      })),
    });
    return result.count;
  });

  return { created };
}

/**
 * What closing a term would end.
 *
 * Separate from the count because the warden is told "this ends 215
 * allocations and frees 215 beds" before they press anything.
 */
export async function planTermClose(
  prisma: PrismaClient,
  input: { companyId: string; termId: string },
): Promise<{ termId: string; ending: number; byHostel: Array<{ hostelId: string; hostelName: string; count: number }> }> {
  const rows = await prisma.schoolBoardingAllocation.findMany({
    where: { companyId, termId: input.termId, status: "ACTIVE" },
    include: { hostel: { select: { id: true, name: true } } },
  });

  const counts = new Map<string, { hostelId: string; hostelName: string; count: number }>();
  for (const row of rows) {
    const entry = counts.get(row.hostelId) ?? {
      hostelId: row.hostelId,
      hostelName: row.hostel.name,
      count: 0,
    };
    entry.count += 1;
    counts.set(row.hostelId, entry);
  }

  return {
    termId: input.termId,
    ending: rows.length,
    byHostel: [...counts.values()].sort((a, b) => b.count - a.count),
  };
}

/**
 * End every active allocation in a term.
 *
 * ENDED rather than deleted, always. "Who slept in bed 12 last October" is a
 * safeguarding question, and a school that answers it with a shrug because the
 * rows were tidied away has a real problem. The beds come free because free is
 * computed from ACTIVE allocations, not from the absence of a row.
 */
export async function applyTermClose(
  prisma: PrismaClient,
  input: { companyId: string; termId: string; endDate: Date },
): Promise<{ ended: number }> {
  const result = await prisma.schoolBoardingAllocation.updateMany({
    where: { companyId, termId: input.termId, status: "ACTIVE" },
    data: { status: "ENDED", endDate: input.endDate },
  });
  return { ended: result.count };
}
