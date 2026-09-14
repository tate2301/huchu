import { prisma } from "@/lib/prisma";
import { getTeacherProfile } from "@/lib/schools/governance-v2";

/**
 * Who may work on one class's subject.
 *
 * The persona grant and the teaching assignment are two different questions,
 * and the marks and homework routes were only asking the first. Every teacher
 * holds `schools.results: view`, so "may this role read marks" is true for all
 * of them and says nothing about whose class the marks belong to — which is how
 * a Form 2 teacher could read a Form 4 mark sheet, and open a draft result
 * sheet over it, by quoting an id.
 *
 * The line is drawn at `moderate` rather than at a list of roles because the
 * write side of those same routes already draws it there, and two answers to
 * one question drift apart. A moderator — head of department, head, the
 * tenant's administrators — is meant to reach across classes. Everybody else
 * gets their own.
 */

export type ClassSubjectCaller = {
  /** The caller's teacher profile, or null when they have none. */
  teacherProfileId: string | null;
  /** Whether the caller reads and writes across every class, not just their own. */
  moderates: boolean;
};

/**
 * Office roles, which reach every class because they hold no teaching
 * assignment to be narrowed to.
 *
 * Scoping these to "their own classes" would scope them to nothing, which
 * refuses the registrar the roll they are employed to keep rather than closing
 * anything. What stops the office writing marks is the persona grant on the
 * route — `capture` and `submit`, which no office role holds — not this test.
 *
 * BURSAR is deliberately absent. It holds no `schools.results` grant at all, so
 * it is already refused upstream; were it ever given one, reading whole mark
 * sheets should be a decision somebody makes, not something inherited here.
 */
const officeRoles = new Set(["SUPERADMIN", "MANAGER", "SCHOOL_ADMIN", "REGISTRAR"]);

function readsEveryClass(role: string | null | undefined): boolean {
  return role ? officeRoles.has(role.trim().toUpperCase()) : false;
}

/**
 * The caller, as the checks below need them.
 *
 * A moderator's profile is not looked up: their reach does not depend on
 * having one, and the head of a school need not be on the teaching staff.
 */
export async function classSubjectCaller(input: {
  companyId: string;
  userId: string;
  role?: string | null;
  moderates: boolean;
}): Promise<ClassSubjectCaller> {
  if (input.moderates || readsEveryClass(input.role)) {
    return { teacherProfileId: null, moderates: true };
  }
  const profile = await getTeacherProfile(input.companyId, input.userId);
  return { teacherProfileId: profile?.id ?? null, moderates: false };
}

/**
 * Null when the caller may act on this class subject, or the refusal to send.
 *
 * A missing row is refused in the same words as somebody else's, so walking ids
 * teaches a caller nothing about which classes exist.
 */
export function classSubjectDenial(
  classSubject: { teacherProfileId: string } | null,
  caller: ClassSubjectCaller,
): string | null {
  if (caller.moderates) return classSubject ? null : "That class is not one of yours";
  if (!classSubject) return "That class is not one of yours";
  if (!caller.teacherProfileId) return "You are not linked to a teacher profile";
  if (classSubject.teacherProfileId !== caller.teacherProfileId) {
    return "That class is not one of yours";
  }
  return null;
}

export type OwnedClassSubject = {
  id: string;
  termId: string;
  classId: string;
  streamId: string | null;
  teacherProfileId: string;
};

/** The class subject, once it is established the caller may have it. */
export async function ownedClassSubject(input: {
  companyId: string;
  classSubjectId: string;
  caller: ClassSubjectCaller;
}): Promise<{ error: string } | { classSubject: OwnedClassSubject }> {
  const classSubject = await prisma.schoolClassSubject.findFirst({
    where: { id: input.classSubjectId, companyId: input.companyId },
    select: {
      id: true,
      termId: true,
      classId: true,
      streamId: true,
      teacherProfileId: true,
    },
  });

  const error = classSubjectDenial(classSubject, input.caller);
  if (error || !classSubject) return { error: error ?? "That class is not one of yours" };
  return { classSubject };
}

/**
 * Whether one teacher takes every subject a class is timetabled for.
 *
 * The whole-class acts — rolling the term's marks onto a result sheet, above
 * all — are not per-subject: the roll-up deletes the sheet's lines and rewrites
 * them from every subject in the class, so a teacher scoped to one subject
 * cannot be allowed to run it over the other nine. A primary class teacher who
 * takes the lot is the exception, and is exactly the person who rolls up their
 * own class.
 *
 * An empty list is not ownership. A class with no subjects on it would
 * otherwise pass vacuously.
 */
export function teachesEverySubject(
  classSubjects: Array<{ teacherProfileId: string }>,
  teacherProfileId: string,
): boolean {
  if (classSubjects.length === 0) return false;
  return classSubjects.every((row) => row.teacherProfileId === teacherProfileId);
}

/**
 * The active subjects of one class in one term.
 *
 * A stream narrows to that stream's subjects plus the ones taught to the whole
 * class, which is how `SchoolClassSubject` records a subject that is not
 * streamed.
 */
export async function activeClassSubjects(input: {
  companyId: string;
  termId: string;
  classId: string;
  streamId?: string | null;
}): Promise<Array<{ id: string; teacherProfileId: string }>> {
  return prisma.schoolClassSubject.findMany({
    where: {
      companyId: input.companyId,
      termId: input.termId,
      classId: input.classId,
      isActive: true,
      ...(input.streamId
        ? { OR: [{ streamId: input.streamId }, { streamId: null }] }
        : {}),
    },
    select: { id: true, teacherProfileId: true },
  });
}
