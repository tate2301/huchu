import { prisma } from "@corelithzw/db/client";

/**
 * Making a teacher and an employee the same person.
 *
 * The school pack knows Ms Banda through `SchoolTeacherProfile` — her
 * timetable, her mark book, her registers. HR knows her through `Employee` —
 * her payslip, her next of kin, her national ID. Nothing joined the two, so a
 * school asking "who is this and how do we reach her family" answered it by
 * reading two lists side by side.
 *
 * The link is written deliberately, never inferred. A name match is the obvious
 * backfill and is exactly the thing this exists to remove: two people called
 * T Moyo is ordinary, and a wrong link puts one teacher's payslip against
 * another's classes. What this module does is *suggest*, with the reason
 * attached, and leave the press of the button to a person.
 */

export class TeacherLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeacherLinkError";
  }
}

export type EmployeeSuggestion = {
  id: string;
  employeeId: string;
  name: string;
  jobTitle: string | null;
  phone: string;
  /** How confident the suggestion is, and why. */
  reason: string;
  confidence: "certain" | "likely" | "possible";
};

/**
 * Employees who might be this teacher.
 *
 * Three signals, strongest first:
 *
 * 1. The same user account. That is not a guess — it is the same login, so the
 *    same person, and it is offered as `certain`.
 * 2. The same name, exactly. `likely`, because names repeat.
 * 3. Nothing else. There is deliberately no fuzzy match: a screen that offers
 *    six half-right names is a screen where somebody picks the wrong one.
 *
 * Employees already linked to another profile are excluded, because the unique
 * index would refuse them and offering an option that cannot be taken is worse
 * than not offering it.
 */
export async function suggestEmployeesForTeacher(input: {
  companyId: string;
  teacherProfileId: string;
}): Promise<EmployeeSuggestion[]> {
  const profile = await prisma.schoolTeacherProfile.findFirst({
    where: { id: input.teacherProfileId, companyId: input.companyId },
    select: {
      id: true,
      userId: true,
      employeeId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!profile) throw new TeacherLinkError("Teacher profile not found");
  if (profile.employeeId) return [];

  const employees = await prisma.employee.findMany({
    where: {
      companyId: input.companyId,
      isActive: true,
      schoolTeacherProfile: null,
    },
    select: {
      id: true,
      employeeId: true,
      name: true,
      jobTitle: true,
      phone: true,
      userId: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  const suggestions: EmployeeSuggestion[] = [];
  const teacherName = profile.user.name?.trim().toLowerCase() ?? "";

  for (const employee of employees) {
    if (employee.userId && employee.userId === profile.userId) {
      suggestions.push({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        jobTitle: employee.jobTitle,
        phone: employee.phone,
        reason: "Same login",
        confidence: "certain",
      });
      continue;
    }
    if (teacherName && employee.name.trim().toLowerCase() === teacherName) {
      suggestions.push({
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.name,
        jobTitle: employee.jobTitle,
        phone: employee.phone,
        reason: "Same name — check before linking",
        confidence: "likely",
      });
    }
  }

  // Certain first. A screen that lists a name match above a login match invites
  // somebody to take the weaker one.
  const order = { certain: 0, likely: 1, possible: 2 } as const;
  return suggestions.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

/**
 * Bind a teacher profile to an employee record.
 *
 * Refuses across companies, refuses an employee another teacher already has,
 * and refuses an employee whose user account belongs to somebody else — that
 * last one is the case where a link would look right and be wrong, because both
 * records would carry a plausible name.
 */
export async function linkTeacherToEmployee(input: {
  companyId: string;
  teacherProfileId: string;
  employeeId: string;
}) {
  const [profile, employee] = await Promise.all([
    prisma.schoolTeacherProfile.findFirst({
      where: { id: input.teacherProfileId, companyId: input.companyId },
      select: { id: true, userId: true, employeeId: true },
    }),
    prisma.employee.findFirst({
      where: { id: input.employeeId, companyId: input.companyId },
      select: {
        id: true,
        name: true,
        userId: true,
        schoolTeacherProfile: { select: { id: true } },
      },
    }),
  ]);

  if (!profile) throw new TeacherLinkError("Teacher profile not found");
  if (!employee) {
    throw new TeacherLinkError("That employee is not on this school's staff list");
  }
  if (profile.employeeId && profile.employeeId !== employee.id) {
    throw new TeacherLinkError(
      "This teacher is already linked to a different employee record. Unlink it first.",
    );
  }
  if (employee.schoolTeacherProfile && employee.schoolTeacherProfile.id !== profile.id) {
    throw new TeacherLinkError(`${employee.name} is already linked to another teacher`);
  }
  if (employee.userId && employee.userId !== profile.userId) {
    throw new TeacherLinkError(
      `${employee.name}'s employee record belongs to a different login. Linking these would put one person's payslip against another's classes.`,
    );
  }

  return prisma.schoolTeacherProfile.update({
    where: { id: profile.id },
    data: { employeeId: employee.id },
    select: { id: true, employeeId: true },
  });
}

/**
 * Break the link.
 *
 * Sets the column to null rather than deleting anything: both records are real
 * and the mistake being corrected is only which one belongs to which.
 */
export async function unlinkTeacherFromEmployee(input: {
  companyId: string;
  teacherProfileId: string;
}) {
  const profile = await prisma.schoolTeacherProfile.findFirst({
    where: { id: input.teacherProfileId, companyId: input.companyId },
    select: { id: true },
  });
  if (!profile) throw new TeacherLinkError("Teacher profile not found");

  return prisma.schoolTeacherProfile.update({
    where: { id: profile.id },
    data: { employeeId: null },
    select: { id: true, employeeId: true },
  });
}

/**
 * How much of the staff list is joined up, for the screen to say so.
 *
 * A count rather than a list: "9 of 14 teachers have no HR record" is a task
 * somebody picks up, where a silent absence on each row is one nobody notices.
 */
export async function teacherLinkCoverage(companyId: string) {
  const [total, linked] = await Promise.all([
    prisma.schoolTeacherProfile.count({ where: { companyId, isActive: true } }),
    prisma.schoolTeacherProfile.count({
      where: { companyId, isActive: true, employeeId: { not: null } },
    }),
  ]);
  return { total, linked, unlinked: total - linked };
}
