import type { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import {
  canMoveTo,
  transitionRefusal,
  type ApplicationStage,
} from "./admissions-stages";

export {
  ALLOWED_TRANSITIONS,
  CLOSED_STAGES,
  PIPELINE_STAGES,
  STAGE_LABELS,
  canMoveTo,
  offerHasLapsed,
  transitionRefusal,
  type ApplicationStage,
} from "./admissions-stages";

export class StageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageTransitionError";
  }
}

/**
 * The next application number for a school.
 *
 * Reads the highest existing number rather than counting rows. Applications are
 * withdrawn rather than deleted, so a withdrawn one keeps its number and the
 * next applicant gets a fresh one — where counting rows would hand APP-0042 to
 * two children and leave a school filing by number with two identical folders.
 * (Hard-deleting the *highest* number does reissue it. Nothing in the module
 * hard-deletes an application; if something ever does, this needs a counter.)
 *
 * Takes the transaction client so the read and the insert are in the same one —
 * two registrars typing at once would otherwise both see the same maximum. The
 * unique index is what actually stops them; this makes it rare rather than
 * routine.
 */
export async function nextApplicationNo(
  companyId: string,
  year: number,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const prefix = `APP-${year}-`;
  const latest = await db.schoolApplication.findFirst({
    where: { companyId, applicationNo: { startsWith: prefix } },
    select: { applicationNo: true },
    orderBy: { applicationNo: "desc" },
  });
  const previous = latest ? Number(latest.applicationNo.slice(prefix.length)) : 0;
  const next = Number.isFinite(previous) ? previous + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export type DuplicateCandidate = {
  id: string;
  applicationNo: string;
  firstName: string;
  lastName: string;
  stage: ApplicationStage;
  reason: string;
};

/**
 * Applications that might be the same child.
 *
 * Reported, never blocked. A school with two boys called Tendai Moyo in the
 * same intake is ordinary, and refusing the second application would mean
 * telling a parent standing at the desk that the system says they already
 * applied. What a registrar needs is the other record on screen so they can
 * look.
 *
 * Two signals: the same name (with a date of birth, where both have one), and
 * the same guardian phone number. The second catches siblings applying
 * together, which is not a duplicate but is worth seeing.
 */
export async function findDuplicateApplications(
  input: {
    companyId: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: Date | null;
    guardianPhone?: string | null;
    excludeId?: string;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<DuplicateCandidate[]> {
  const byName = await db.schoolApplication.findMany({
    where: {
      companyId: input.companyId,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      firstName: { equals: input.firstName, mode: "insensitive" },
      lastName: { equals: input.lastName, mode: "insensitive" },
    },
    select: {
      id: true,
      applicationNo: true,
      firstName: true,
      lastName: true,
      stage: true,
      dateOfBirth: true,
    },
    take: 10,
  });

  const byPhone = input.guardianPhone
    ? await db.schoolApplication.findMany({
        where: {
          companyId: input.companyId,
          ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
          guardianPhone: input.guardianPhone,
        },
        select: {
          id: true,
          applicationNo: true,
          firstName: true,
          lastName: true,
          stage: true,
        },
        take: 10,
      })
    : [];

  const found = new Map<string, DuplicateCandidate>();

  for (const row of byName) {
    const sameBirthday =
      input.dateOfBirth && row.dateOfBirth
        ? new Date(row.dateOfBirth).getTime() === input.dateOfBirth.getTime()
        : null;
    // A matching name with a *different* date of birth is a different child,
    // and reporting it would train the registrar to dismiss the warning.
    if (sameBirthday === false) continue;
    found.set(row.id, {
      id: row.id,
      applicationNo: row.applicationNo,
      firstName: row.firstName,
      lastName: row.lastName,
      stage: row.stage,
      reason: sameBirthday ? "Same name and date of birth" : "Same name",
    });
  }

  for (const row of byPhone) {
    if (found.has(row.id)) continue;
    found.set(row.id, {
      id: row.id,
      applicationNo: row.applicationNo,
      firstName: row.firstName,
      lastName: row.lastName,
      stage: row.stage,
      reason: "Same guardian phone number",
    });
  }

  return [...found.values()];
}

/**
 * Move an application to a new stage, recording who did it.
 *
 * The stage machine is enforced here rather than by the database: the rules are
 * about *sequence*, which a CHECK constraint cannot see, and the useful part is
 * the sentence explaining why a move was refused. What the database does hold
 * is the invariant a wrong sequence would break — an application at ENROLLED
 * with no student.
 */
export async function moveApplication(input: {
  companyId: string;
  applicationId: string;
  toStage: ApplicationStage;
  actorUserId?: string | null;
  comment?: string | null;
  /** Offers need a date, and one nobody answers has to expire. */
  offerExpiresAt?: Date | null;
}) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.schoolApplication.findFirst({
      where: { id: input.applicationId, companyId: input.companyId },
      select: { id: true, stage: true, studentId: true },
    });
    if (!application) throw new StageTransitionError("Application not found");

    const from = application.stage as ApplicationStage;
    if (from === input.toStage) {
      return { id: application.id, stage: from, unchanged: true };
    }

    const refusal = transitionRefusal(from, input.toStage);
    if (refusal) throw new StageTransitionError(refusal);

    // Checked here so the caller gets a sentence. The database refuses it too,
    // but as a constraint violation nobody can act on.
    if (
      input.toStage === "OFFERED" &&
      input.offerExpiresAt &&
      input.offerExpiresAt.getTime() < Date.now()
    ) {
      throw new StageTransitionError(
        "That offer would expire before it was made. Pick a date in the future.",
      );
    }

    if (input.toStage === "ENROLLED") {
      throw new StageTransitionError(
        "Enrolling creates a student record. Use the enrol action rather than moving the stage.",
      );
    }

    await tx.schoolApplication.update({
      where: { id: application.id },
      data: {
        stage: input.toStage,
        ...(input.toStage === "OFFERED"
          ? {
              offeredAt: new Date(),
              offerExpiresAt: input.offerExpiresAt ?? null,
            }
          : {}),
        ...(input.actorUserId ? { decidedById: input.actorUserId } : {}),
      },
    });

    await tx.schoolApplicationEvent.create({
      data: {
        companyId: input.companyId,
        applicationId: application.id,
        fromStage: from,
        toStage: input.toStage,
        actorUserId: input.actorUserId ?? null,
        comment: input.comment ?? null,
      },
    });

    return { id: application.id, stage: input.toStage, unchanged: false };
  });
}

/**
 * Turn an accepted applicant into a child on the roll.
 *
 * One transaction: the student, the enrolment, the stage and the trail. Half of
 * this is a child with a student number and no class, or a class place held for
 * an application that still says ACCEPTED — and the second is the one that
 * makes a school over-offer.
 *
 * The application keeps its own record rather than being deleted. "Who applied
 * and when" is a question schools are asked years later.
 */
export async function enrolApplicant(input: {
  companyId: string;
  applicationId: string;
  studentNo: string;
  classId: string;
  streamId?: string | null;
  termId: string;
  isBoarding?: boolean;
  actorUserId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.schoolApplication.findFirst({
      where: { id: input.applicationId, companyId: input.companyId },
      select: {
        id: true,
        stage: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        studentId: true,
      },
    });
    if (!application) throw new StageTransitionError("Application not found");
    if (application.studentId) {
      throw new StageTransitionError("This applicant is already on the roll");
    }

    const from = application.stage as ApplicationStage;
    if (!canMoveTo(from, "ENROLLED")) {
      throw new StageTransitionError(
        `An application has to be accepted before it is enrolled — this one is at ${from.toLowerCase()}.`,
      );
    }

    const student = await tx.schoolStudent.create({
      data: {
        companyId: input.companyId,
        studentNo: input.studentNo,
        firstName: application.firstName,
        lastName: application.lastName,
        dateOfBirth: application.dateOfBirth,
        gender: application.gender,
        status: "ACTIVE",
        isBoarding: input.isBoarding ?? false,
        currentClassId: input.classId,
        currentStreamId: input.streamId ?? null,
      },
      select: { id: true, studentNo: true },
    });

    await tx.schoolEnrollment.create({
      data: {
        companyId: input.companyId,
        studentId: student.id,
        termId: input.termId,
        classId: input.classId,
        streamId: input.streamId ?? null,
        status: "ACTIVE",
      },
    });

    await tx.schoolApplication.update({
      where: { id: application.id },
      data: { stage: "ENROLLED", studentId: student.id },
    });

    await tx.schoolApplicationEvent.create({
      data: {
        companyId: input.companyId,
        applicationId: application.id,
        fromStage: from,
        toStage: "ENROLLED",
        actorUserId: input.actorUserId ?? null,
        comment: `Enrolled as ${student.studentNo}`,
      },
    });

    return { applicationId: application.id, studentId: student.id, studentNo: student.studentNo };
  });
}

/**
 * How many applications sit at each stage, for the board's column headings.
 *
 * One grouped query rather than one count per column — nine round trips to draw
 * nine numbers is how a board becomes the slowest page in the module.
 */
export async function applicationPipelineCounts(input: {
  companyId: string;
  classId?: string;
  termId?: string;
}) {
  const rows = await prisma.schoolApplication.groupBy({
    by: ["stage"],
    where: {
      companyId: input.companyId,
      ...(input.classId ? { appliedForClassId: input.classId } : {}),
      ...(input.termId ? { intendedTermId: input.termId } : {}),
    },
    _count: { _all: true },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.stage] = row._count._all;
  return counts;
}
