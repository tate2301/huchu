import {
  getPersonaPermissions,
  hasPersonaPermission,
  personaForRole,
  type PersonaCode,
} from "@/lib/platform/personas";

/**
 * Who may do what inside the campus module.
 *
 * `lib/platform/personas.ts` has always described the grants; this is the thin
 * layer the screens use, so a button and the endpoint behind it are answering
 * the same question. Before this existed every campus screen rendered every
 * verb and let the API say no — a bursar saw the head's buttons and learned the
 * answer as a red alert after clicking. `/schools/academics/identity` was the
 * only route that gated its controls, and nothing copied it.
 */

export type SchoolResource =
  | "schools.academics"
  | "schools.admissions"
  | "schools.students"
  | "schools.teachers"
  | "schools.attendance"
  | "schools.fees"
  | "schools.boarding"
  | "schools.welfare"
  | "schools.results"
  | "schools.reports"
  | "schools.conduct"
  // Separate from `schools.conduct`, and not a wider version of it. A pastoral
  // note is not a discipline record, and a grant on this resource answers only
  // "may this role read pastoral notes at all" — never "may this person read
  // this note about this pupil", which is `lib/schools/pastoral-access.ts`.
  | "schools.pastoral"
  | "schools.exams"
  | "schools.leavers"
  | "schools.alumni";

/** The verbs `SCHOOL_FULL_ACTIONS` enumerates, as a type. */
export type SchoolAction =
  | "view"
  | "create"
  | "edit"
  | "archive"
  | "approve"
  | "invite"
  | "capture"
  | "submit"
  | "moderate"
  | "request-changes"
  | "publish"
  | "unpublish"
  | "issue"
  | "receive-payment"
  | "waive"
  | "write-off"
  | "void"
  | "refund"
  | "allocate-bed"
  | "approve-leave"
  | "check-in"
  | "check-out"
  | "configure"
  | "notify-families"
  | "reply"
  | "book-meeting"
  | "lock"
  // Conduct: record a merit or a demerit. Separate from `create` because a
  // teacher should be able to award one and not to log an incident.
  | "award"
  // Conduct: stamp that a guardian was told. The one verb the behaviour log
  // exists for.
  | "tell-home"
  // Detention: mark a register.
  | "mark"
  // Exams: enter a candidate for a subject, and build the entry file.
  | "enter"
  // Leavers: settle one of the five clearance marks.
  | "clear"
  // Leavers and alumni: issue a document, record a destination.
  | "record";

/**
 * The tenant's own administrators, who are not constrained by a vertical
 * persona — `personaForRole` returns null for them deliberately, and callers
 * are expected to check for them before asking about grants.
 */
const UNCONSTRAINED_ROLES = new Set(["SUPERADMIN", "MANAGER"]);

export function isUnconstrainedRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return UNCONSTRAINED_ROLES.has(role.trim().toUpperCase());
}

export function canSchool(
  role: string | null | undefined,
  resource: SchoolResource,
  action: SchoolAction,
): boolean {
  if (isUnconstrainedRole(role)) return true;
  const persona = personaForRole(role);
  if (!persona) return false;
  return hasPersonaPermission([persona], resource, action);
}

export type SchoolAccess = {
  role: string | null;
  persona: PersonaCode | null;
  /** True for SUPERADMIN and MANAGER, who bypass the persona grants. */
  unconstrained: boolean;
  can: (resource: SchoolResource, action: SchoolAction) => boolean;
  /** Every action granted on a resource — for building a row's menu in one pass. */
  actionsOn: (resource: SchoolResource) => Set<SchoolAction>;
};

export function schoolAccess(role: string | null | undefined): SchoolAccess {
  const unconstrained = isUnconstrainedRole(role);
  const persona = personaForRole(role);
  return {
    role: role ?? null,
    persona,
    unconstrained,
    can: (resource, action) => canSchool(role, resource, action),
    actionsOn: (resource) => {
      if (unconstrained) return new Set(ALL_ACTIONS);
      if (!persona) return new Set<SchoolAction>();
      const grant = getPersonaPermissions(persona).find((p) => p.resource === resource);
      return new Set((grant?.actions ?? []) as SchoolAction[]);
    },
  };
}

const ALL_ACTIONS: SchoolAction[] = [
  "view",
  "create",
  "edit",
  "archive",
  "approve",
  "invite",
  "capture",
  "submit",
  "moderate",
  "request-changes",
  "publish",
  "unpublish",
  "issue",
  "receive-payment",
  "waive",
  "write-off",
  "void",
  "refund",
  "allocate-bed",
  "approve-leave",
  "check-in",
  "check-out",
  "configure",
  "notify-families",
  "reply",
  "book-meeting",
  "lock",
  "award",
  "tell-home",
  "mark",
  "enter",
  "clear",
  "record",
];

/**
 * What to tell somebody who cannot do a thing.
 *
 * Naming the role that can is the difference between a dead end and a next
 * step: "ask the bursar" is actionable, "you do not have permission" is not.
 */
const WHO_CAN: Record<SchoolResource, Partial<Record<SchoolAction, string>>> = {
  "schools.academics": { create: "a school administrator", edit: "a school administrator", configure: "a school administrator" },
  "schools.admissions": { approve: "the registrar or a school administrator" },
  "schools.students": { create: "the registrar", edit: "the registrar", archive: "a school administrator", configure: "a school administrator", "book-meeting": "the teacher, from their portal" },
  "schools.teachers": { create: "the registrar", edit: "the registrar" },
  "schools.attendance": { capture: "the class teacher, from their portal", lock: "the office" },
  "schools.fees": { create: "the bursar", edit: "the bursar", issue: "the bursar", "receive-payment": "the bursar", waive: "the bursar", "write-off": "the bursar", void: "the bursar", refund: "the bursar" },
  "schools.boarding": { "allocate-bed": "the warden", "approve-leave": "the warden", "check-in": "the warden", "check-out": "the warden" },
  "schools.welfare": { create: "the warden or the school nurse", edit: "the warden or the school nurse", archive: "the warden or the school nurse" },
  "schools.results": { moderate: "the head of department", approve: "the head of department", publish: "a school administrator", capture: "the subject teacher, from their portal" },
  "schools.reports": { "notify-families": "the office, the bursar or a class teacher", reply: "the office, the bursar or the head of department" },
  "schools.conduct": { create: "the deputy head or a head of year", edit: "the deputy head", "tell-home": "the deputy head or the office", award: "any member of teaching staff", mark: "the supervisor named on the session", archive: "the deputy head" },
  // A pastoral refusal names the pastoral team rather than a role, because
  // being cleared for a band is a grant to a person and not a rank. Seniority
  // does not reach a note: the Group Head reads nothing unless he is named on
  // one.
  "schools.pastoral": { view: "the head and the pastoral team", create: "the head and the pastoral team", edit: "the note's author", archive: "the head" },
  "schools.exams": { create: "the exams officer or a school administrator", edit: "the exams officer", enter: "the exams officer", issue: "the bursar", capture: "the exams officer", configure: "a school administrator" },
  "schools.leavers": { create: "the registrar", clear: "the bursar, the librarian or the warden, each for their own mark", record: "the registrar", archive: "a school administrator" },
  "schools.alumni": { create: "the registrar", edit: "the registrar", record: "the registrar or the development office" },
};

export function whoCan(resource: SchoolResource, action: SchoolAction): string | null {
  return WHO_CAN[resource]?.[action] ?? null;
}
