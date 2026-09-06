import {
  getPersonaPermissions,
  hasPersonaPermission,
  personaForRole,
  type PersonaCode,
} from "@corelithzw/platform/personas";

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
  | "schools.results"
  | "schools.reports";

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
  | "configure";

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
  "schools.students": { create: "the registrar", edit: "the registrar", archive: "a school administrator", configure: "a school administrator" },
  "schools.teachers": { create: "the registrar", edit: "the registrar" },
  "schools.attendance": { capture: "the class teacher, from their portal" },
  "schools.fees": { create: "the bursar", edit: "the bursar", issue: "the bursar", "receive-payment": "the bursar", waive: "the bursar", "write-off": "the bursar", void: "the bursar", refund: "the bursar" },
  "schools.boarding": { "allocate-bed": "the warden", "approve-leave": "the warden", "check-in": "the warden", "check-out": "the warden" },
  "schools.results": { moderate: "the head of department", approve: "the head of department", publish: "a school administrator", capture: "the subject teacher, from their portal" },
  "schools.reports": {},
};

export function whoCan(resource: SchoolResource, action: SchoolAction): string | null {
  return WHO_CAN[resource]?.[action] ?? null;
}
