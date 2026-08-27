import { prisma } from "@/lib/prisma";

/**
 * What the sanatorium has to know.
 *
 * One standing record per child — allergies, conditions, the doctor, the four
 * consents — and a log of what has actually happened to them. Kept apart
 * because they answer different questions: "is she allergic to anything" wants
 * one row, and "when did she last have paracetamol" wants all of them.
 *
 * Nothing here is soft-deleted. A health record that disappears is worse than
 * one that says "nothing recorded", so the empty state is a real state.
 */

export class HealthRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthRecordError";
  }
}

export type { ConsentKey } from "./health-consents";
export {
  anyConsentGiven,
  CONSENT_KEYS,
  CONSENT_LABELS,
  URGENT_GAP,
} from "./health-consents";

import { anyConsentGiven, URGENT_GAP, type ConsentKey } from "./health-consents";

export type ConsentFlags = Record<ConsentKey, boolean>;


/**
 * What the office still has to chase, per child.
 *
 * The wording is the sentence somebody has to act on, not a field name. "No
 * consent recorded" and "No doctor recorded" are what a warden reads down the
 * list looking for, and an allergy recorded with no consent to treat gets its
 * own line — "Allergy on file, no consent to treat" — because it is the one
 * specific combination a boarding school cannot be caught by, and it has to be
 * findable by eye rather than by inference from two other gaps.
 *
 * Emergency treatment is called out separately from first aid for the same
 * reason: they are one checkbox apart in the form and a world apart at two in
 * the morning.
 */
export function healthGaps(record: {
  allergies: string | null;
  consentEmergencyTreatment: boolean;
  consentFirstAid: boolean;
  doctorPhone: string | null;
} | null): string[] {
  if (!record) return ["Nothing recorded at all"];

  const gaps: string[] = [];
  if (!record.consentEmergencyTreatment) gaps.push("No consent recorded");
  if (!record.consentFirstAid) gaps.push("No first-aid consent");
  if (!record.doctorPhone) gaps.push("No doctor recorded");
  if (record.allergies && !record.consentEmergencyTreatment) {
    gaps.push(URGENT_GAP);
  }
  return gaps;
}

export type HealthRecordInput = Partial<ConsentFlags> & {
  bloodGroup?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  medications?: string | null;
  dietaryRequirements?: string | null;
  doctorName?: string | null;
  doctorPhone?: string | null;
  medicalAidProvider?: string | null;
  medicalAidNumber?: string | null;
  consentGivenBy?: string | null;
  notes?: string | null;
};

/**
 * Create or update a child's health record.
 *
 * Upsert rather than create-then-edit, because there is exactly one per child
 * and asking a warden to press "new" before typing an allergy is a step that
 * exists only to serve the schema.
 *
 * A consent switched on without a name against it is refused here as well as by
 * the database, so the person typing gets a sentence rather than a constraint.
 * `consentGivenAt` is stamped by the server: a consent whose date came from the
 * client is a consent somebody can back-date.
 */
export async function saveHealthRecord(input: {
  companyId: string;
  studentId: string;
  values: HealthRecordInput;
  updatedById?: string | null;
}) {
  const student = await prisma.schoolStudent.findFirst({
    where: { id: input.studentId, companyId: input.companyId },
    select: { id: true },
  });
  if (!student) throw new HealthRecordError("Student not found");

  const existing = await prisma.schoolHealthRecord.findUnique({
    where: { studentId: input.studentId },
    select: {
      id: true,
      consentGivenBy: true,
      consentGivenAt: true,
      consentFirstAid: true,
      consentEmergencyTreatment: true,
      consentPhotography: true,
      consentOutings: true,
    },
  });

  const merged: ConsentFlags = {
    consentFirstAid: input.values.consentFirstAid ?? existing?.consentFirstAid ?? false,
    consentEmergencyTreatment:
      input.values.consentEmergencyTreatment ??
      existing?.consentEmergencyTreatment ??
      false,
    consentPhotography:
      input.values.consentPhotography ?? existing?.consentPhotography ?? false,
    consentOutings: input.values.consentOutings ?? existing?.consentOutings ?? false,
  };

  const givenBy =
    input.values.consentGivenBy !== undefined
      ? (input.values.consentGivenBy?.trim() || null)
      : (existing?.consentGivenBy ?? null);

  if (anyConsentGiven(merged) && !givenBy) {
    throw new HealthRecordError(
      "Record who gave consent — a consent with nobody's name against it is not one the school can rely on.",
    );
  }

  // Stamped server-side. A date supplied by the caller is a date somebody can
  // back-date, and this is the field a school is asked to produce afterwards.
  const givenAt = givenBy
    ? existing?.consentGivenBy === givenBy && existing?.consentGivenAt
      ? existing.consentGivenAt
      : new Date()
    : null;

  const data = {
    bloodGroup: input.values.bloodGroup ?? undefined,
    allergies: input.values.allergies ?? undefined,
    chronicConditions: input.values.chronicConditions ?? undefined,
    medications: input.values.medications ?? undefined,
    dietaryRequirements: input.values.dietaryRequirements ?? undefined,
    doctorName: input.values.doctorName ?? undefined,
    doctorPhone: input.values.doctorPhone ?? undefined,
    medicalAidProvider: input.values.medicalAidProvider ?? undefined,
    medicalAidNumber: input.values.medicalAidNumber ?? undefined,
    notes: input.values.notes ?? undefined,
    ...merged,
    consentGivenBy: givenBy,
    consentGivenAt: givenAt,
    updatedById: input.updatedById ?? null,
  };

  return prisma.schoolHealthRecord.upsert({
    where: { studentId: input.studentId },
    create: { companyId: input.companyId, studentId: input.studentId, ...data },
    update: data,
    select: { id: true, studentId: true, consentGivenBy: true, consentGivenAt: true },
  });
}

/**
 * Record something that happened.
 *
 * Creates the standing record if there is not one yet, because a child arriving
 * at the sanatorium is not a moment to be told to fill in a form first.
 */
export async function recordHealthEvent(input: {
  companyId: string;
  studentId: string;
  kind: "SANATORIUM_VISIT" | "MEDICATION" | "INJURY" | "REFERRAL" | "SCREENING";
  summary: string;
  treatment?: string | null;
  guardianNotified?: boolean;
  occurredAt?: Date;
  recordedById?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.schoolStudent.findFirst({
      where: { id: input.studentId, companyId: input.companyId },
      select: { id: true },
    });
    if (!student) throw new HealthRecordError("Student not found");

    const record =
      (await tx.schoolHealthRecord.findUnique({
        where: { studentId: input.studentId },
        select: { id: true },
      })) ??
      (await tx.schoolHealthRecord.create({
        data: { companyId: input.companyId, studentId: input.studentId },
        select: { id: true },
      }));

    return tx.schoolHealthEvent.create({
      data: {
        companyId: input.companyId,
        healthRecordId: record.id,
        studentId: input.studentId,
        kind: input.kind,
        summary: input.summary,
        treatment: input.treatment ?? null,
        guardianNotified: input.guardianNotified ?? false,
        occurredAt: input.occurredAt ?? new Date(),
        recordedById: input.recordedById ?? null,
      },
      select: { id: true, occurredAt: true, kind: true },
    });
  });
}

/**
 * Clear a child's standing record.
 *
 * The row goes, and with it every consent and allergy on it. This is for a
 * record entered against the wrong child — the case where leaving it is worse
 * than losing it, because a peanut allergy filed under the wrong name is a
 * sentence a nurse will act on.
 *
 * The visit log stays. What happened to a child happened whatever the standing
 * record said at the time, and a nosebleed in March is not undone by correcting
 * a consent in August. `SchoolHealthEvent.healthRecordId` is why this refuses
 * outright once there are events: deleting the record would take the history
 * with it, so a record with a log behind it is corrected, not cleared.
 */
export async function clearHealthRecord(input: {
  companyId: string;
  studentId: string;
}) {
  const record = await prisma.schoolHealthRecord.findFirst({
    where: { studentId: input.studentId, companyId: input.companyId },
    select: { id: true, _count: { select: { events: true } } },
  });
  if (!record) throw new HealthRecordError("Nothing is recorded for this child");

  if (record._count.events > 0) {
    throw new HealthRecordError(
      "This child has visits logged against them. Correct the record rather than clearing it.",
    );
  }

  await prisma.schoolHealthRecord.delete({ where: { id: record.id } });
  return { id: record.id, studentId: input.studentId, deleted: true };
}

/**
 * The welfare list for a year group: who has what, and what is still missing.
 *
 * Built from the students outward rather than from the health records, so a
 * child with no record at all is a row saying "nothing recorded" instead of an
 * absence nobody notices. Same rule as the attendance and bed boards.
 */
export async function classHealthList(input: {
  companyId: string;
  classId?: string;
  boardingOnly?: boolean;
}) {
  const students = await prisma.schoolStudent.findMany({
    where: {
      companyId: input.companyId,
      status: "ACTIVE",
      ...(input.classId ? { currentClassId: input.classId } : {}),
      ...(input.boardingOnly ? { isBoarding: true } : {}),
    },
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      isBoarding: true,
      currentClass: { select: { id: true, name: true } },
      healthRecord: {
        select: {
          id: true,
          allergies: true,
          chronicConditions: true,
          medications: true,
          dietaryRequirements: true,
          doctorName: true,
          doctorPhone: true,
          consentFirstAid: true,
          consentEmergencyTreatment: true,
          consentPhotography: true,
          consentOutings: true,
          consentGivenBy: true,
          consentGivenAt: true,
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });

  return students.map((student) => ({
    student: {
      id: student.id,
      studentNo: student.studentNo,
      firstName: student.firstName,
      lastName: student.lastName,
      isBoarding: student.isBoarding,
      className: student.currentClass?.name ?? null,
    },
    record: student.healthRecord,
    gaps: healthGaps(student.healthRecord),
  }));
}
