import { prisma } from "@/lib/prisma";
import type { SchoolDocumentSourceKey } from "@/lib/documents/schools-sources";
import {
  getGuardianChildLink,
  guardianMaySee,
  resolvePortalGuardian,
  resolvePortalStudent,
  type GuardianConsentKind,
} from "@/lib/schools/portal-identity";

/**
 * Whether a portal account may print a school document.
 *
 * The role check the render route runs first asks whether the caller holds the
 * back-office grant for fees or results. A parent holds neither — the PARENT
 * persona carries `schools.portal.parent` and nothing else — so every download
 * the parent portal offers refuses. Granting the persona `schools.fees view`
 * would open every family's bill to every parent, because the render route has
 * no row-level check of its own: what a portal account may print is decided by
 * the record, not by the role.
 *
 * The rule is the one the portal's own screens already use — the
 * `SchoolStudentGuardian` link and its consent flags, read through
 * `lib/schools/portal-identity` — so a document and the screen it was printed
 * from cannot disagree about who the child belongs to.
 */

/**
 * The documents a portal hands out, and the consent each needs.
 *
 * Deliberately shorter than `SCHOOL_DOCUMENT_SOURCE_KEYS`: a class list is
 * every child's guardian and phone number on one page, and an admission or
 * transfer letter is the office's correspondence. Those stay with the office.
 */
const PORTAL_DOCUMENT_CONSENT: Partial<
  Record<SchoolDocumentSourceKey, GuardianConsentKind>
> = {
  "schools.fee.invoice": "financials",
  "schools.fee.receipt": "financials",
  "schools.fee.statement": "financials",
  "schools.report-card": "academic-results",
};

const PORTAL_ROLES = new Set(["PARENT", "STUDENT"]);

/** A caller whose access to a pupil's paper comes from a link, not a grant. */
export function isPortalDocumentRole(role?: string | null) {
  return role ? PORTAL_ROLES.has(role.toUpperCase()) : false;
}

/**
 * The pupil a requested document is about.
 *
 * A statement and a report card are addressed by the pupil themselves; a bill
 * and a receipt carry their own id and have to be read to find out whose they
 * are. Scoped to the tenant so an id from another school resolves to nobody.
 */
async function subjectStudentId(
  companyId: string,
  sourceKey: SchoolDocumentSourceKey,
  recordId: string,
): Promise<string | null> {
  switch (sourceKey) {
    case "schools.fee.invoice": {
      const invoice = await prisma.schoolFeeInvoice.findFirst({
        where: { id: recordId, companyId },
        select: { studentId: true },
      });
      return invoice?.studentId ?? null;
    }
    case "schools.fee.receipt": {
      const receipt = await prisma.schoolFeeReceipt.findFirst({
        where: { id: recordId, companyId },
        select: { studentId: true },
      });
      return receipt?.studentId ?? null;
    }
    case "schools.fee.statement":
    case "schools.report-card":
      return recordId;
    default:
      return null;
  }
}

export async function canRenderPortalSchoolDocument(input: {
  companyId: string;
  userId: string;
  role?: string | null;
  sourceKey: SchoolDocumentSourceKey;
  recordId?: string | null;
}): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  /*
    One refusal for every way of being refused — a stranger's receipt, a
    document that was never issued, a child whose link withholds the money, a
    document the portal does not hand out at all. A distinct "no such receipt"
    would let a parent walk ids and learn which bills exist, and who is enrolled
    is the thing this portal exists to keep between one family and the school.
  */
  const refusal = {
    allowed: false as const,
    reason: "That document is not available to you.",
  };

  const needs = PORTAL_DOCUMENT_CONSENT[input.sourceKey];
  if (!needs || !input.recordId) return refusal;
  if (!isPortalDocumentRole(input.role)) return refusal;

  const studentId = await subjectStudentId(
    input.companyId,
    input.sourceKey,
    input.recordId,
  );
  if (!studentId) return refusal;

  const identity = {
    companyId: input.companyId,
    userId: input.userId,
    role: input.role,
    requestedId: null,
  };

  if (input.role?.toUpperCase() === "STUDENT") {
    // A pupil's own paper and nobody else's. The consent flags are a property of
    // a guardian link and say nothing about what a child may see of themselves.
    const resolution = await resolvePortalStudent(identity, { select: { id: true } });
    return resolution.subject?.id === studentId ? { allowed: true } : refusal;
  }

  const resolution = await resolvePortalGuardian(identity, { select: { id: true } });
  const guardian = resolution.subject;
  if (!guardian) return refusal;

  const link = await getGuardianChildLink({
    companyId: input.companyId,
    guardianId: guardian.id,
    studentId,
  });
  if (!link || !guardianMaySee(link, needs)) return refusal;

  return { allowed: true };
}
