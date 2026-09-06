import type { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";

/**
 * Who the signed-in portal user is.
 *
 * There is one way to answer that: the `userId` foreign key on
 * `SchoolStudent` and `SchoolGuardian`. Every portal route resolves through
 * here so the answer cannot differ between two endpoints.
 *
 * What this replaced is worth stating plainly, because it was a data breach
 * waiting to be noticed. The student portal took the local part of the session
 * email, upper-cased it, and matched it against `studentNo` — so an account
 * created as `STU0042@anywhere` read that child's attendance, results and fees.
 * The parent portal matched the session email against `SchoolGuardian.email`,
 * which is nullable and not unique, so two guardians sharing a household
 * address resolved to whichever row came back first. Both paths also fell
 * through to an unfiltered query when the session carried no email, returning
 * an arbitrary student from the tenant.
 *
 * A privileged staff user may look at a named student or guardian; that is the
 * only case where an id from the request is honoured, and it is honoured only
 * after the role has been checked.
 */

/**
 * Staff who may view any student or guardian in their school.
 *
 * Kept here rather than imported from `governance-v2` so that scoping a portal
 * response never depends on a set defined for result-sheet moderation. S-0.5
 * replaces both with persona checks.
 */
const PORTAL_OVERSIGHT_ROLES = new Set([
  "SUPERADMIN",
  "MANAGER",
  "SCHOOL_ADMIN",
  "REGISTRAR",
  "BURSAR",
]);

export function canViewAnyPortalSubject(role?: string | null) {
  return role ? PORTAL_OVERSIGHT_ROLES.has(role.toUpperCase()) : false;
}

export type PortalSubjectResolution<T> =
  | { kind: "self"; subject: T }
  | { kind: "oversight"; subject: T }
  /** Signed in, but no student or guardian record is linked to this account. */
  | { kind: "unlinked"; subject: null }
  /** Staff asked for a subject that does not exist in their school. */
  | { kind: "not-found"; subject: null }
  /** A portal user tried to name someone other than themselves. */
  | { kind: "forbidden"; subject: null };

type ResolveInput = {
  companyId: string;
  userId: string;
  role?: string | null;
  /** Set only when a staff user is looking at a named record. */
  requestedId?: string | null;
};

/**
 * Resolve the student whose portal is being read.
 *
 * A portal user always gets their own record or nothing. Naming someone else is
 * refused outright rather than quietly ignored, so a probing request is visible
 * as a 403 instead of looking like an empty account.
 */
export async function resolvePortalStudent<S extends Prisma.SchoolStudentSelect>(
  input: ResolveInput,
  args: { select: S },
): Promise<PortalSubjectResolution<Prisma.SchoolStudentGetPayload<{ select: S }>>> {
  const oversight = canViewAnyPortalSubject(input.role);

  if (input.requestedId && !oversight) {
    return { kind: "forbidden", subject: null };
  }

  if (input.requestedId && oversight) {
    const subject = await prisma.schoolStudent.findFirst({
      where: { id: input.requestedId, companyId: input.companyId },
      select: args.select,
    });
    return subject
      ? { kind: "oversight", subject }
      : { kind: "not-found", subject: null };
  }

  const subject = await prisma.schoolStudent.findFirst({
    where: { companyId: input.companyId, userId: input.userId },
    select: args.select,
  });

  return subject ? { kind: "self", subject } : { kind: "unlinked", subject: null };
}

/** The guardian whose portal is being read. Same contract as the student. */
export async function resolvePortalGuardian<S extends Prisma.SchoolGuardianSelect>(
  input: ResolveInput,
  args: { select: S },
): Promise<PortalSubjectResolution<Prisma.SchoolGuardianGetPayload<{ select: S }>>> {
  const oversight = canViewAnyPortalSubject(input.role);

  if (input.requestedId && !oversight) {
    return { kind: "forbidden", subject: null };
  }

  if (input.requestedId && oversight) {
    const subject = await prisma.schoolGuardian.findFirst({
      where: { id: input.requestedId, companyId: input.companyId },
      select: args.select,
    });
    return subject
      ? { kind: "oversight", subject }
      : { kind: "not-found", subject: null };
  }

  const subject = await prisma.schoolGuardian.findFirst({
    where: { companyId: input.companyId, userId: input.userId },
    select: args.select,
  });

  return subject ? { kind: "self", subject } : { kind: "unlinked", subject: null };
}

/**
 * What a guardian may be shown about a child.
 *
 * The two flags live on the `SchoolStudentGuardian` link because consent is a
 * property of the relationship, not of the parent: a father may receive results
 * for one child and not another, and a separated parent may be on the academic
 * list but off the financial one.
 */
export type GuardianConsentKind = "financials" | "academic-results";

type ConsentBearingLink = {
  canReceiveFinancials: boolean;
  canReceiveAcademicResults: boolean;
};

export function guardianMaySee(link: ConsentBearingLink, kind: GuardianConsentKind) {
  return kind === "financials"
    ? link.canReceiveFinancials
    : link.canReceiveAcademicResults;
}

/** The message a portal shows when consent is withheld. */
export function consentDeniedMessage(kind: GuardianConsentKind) {
  return kind === "financials"
    ? "Financial visibility is disabled for this parent link"
    : "Academic visibility is disabled for this parent link";
}

/**
 * The children this guardian may be shown `kind` for.
 *
 * The aggregate parent portal reads several children at once, so it filters
 * rather than refusing. Using the same predicate as the single-child routes is
 * the point: three inline copies of one rule is how a rule drifts.
 */
export function studentIdsWithConsent<T extends ConsentBearingLink & { studentId: string }>(
  links: T[],
  kind: GuardianConsentKind,
) {
  return links.filter((link) => guardianMaySee(link, kind)).map((link) => link.studentId);
}

/**
 * Is this guardian linked to this student, and may they see this kind of data?
 *
 * The flags were previously honoured by hiding UI, which is not a control —
 * every route that returns money or marks calls this first.
 */
export async function getGuardianChildLink(input: {
  companyId: string;
  guardianId: string;
  studentId: string;
}) {
  return prisma.schoolStudentGuardian.findFirst({
    where: {
      companyId: input.companyId,
      guardianId: input.guardianId,
      studentId: input.studentId,
    },
    select: {
      id: true,
      relationship: true,
      isPrimary: true,
      canReceiveFinancials: true,
      canReceiveAcademicResults: true,
    },
  });
}
