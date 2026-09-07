/**
 * What a member of staff may do in HR.
 *
 * Mirrors `lib/schools/permissions.ts` in shape and for the same reason, but not
 * in mechanism. Schools resolves through the persona catalogue, because a school
 * has registrars and bursars and wardens. HR's users are the tenant's *own*
 * roles — SUPERADMIN, MANAGER, CLERK, OPERATOR — so this is a matrix over those
 * rather than a persona lookup. Inventing HR personas would add an indirection
 * with exactly one implementation.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Until now the only gate in HR was `isApproverRole`, which asks whether the
 * caller is a MANAGER or a SUPERADMIN and is checked only on the routes that
 * approve something. Every read endpoint had no check at all: a company with
 * `hr.payroll` switched on exposed every salary in the business to every signed-in
 * user, including an operator who marks attendance.
 *
 * The route registry does not close that. It answers "is this module switched on
 * for this tenant" and never "which signed-in person is calling" — feature-enabled
 * plus signed-in is the whole of its answer, and that describes a warehouse
 * operator as accurately as it describes the payroll clerk.
 *
 * Payroll is the most sensitive data in the product, and in a payroll-only
 * workspace it is the *entire* product. So the default here is deny.
 */

export const HR_RESOURCES = [
  "hr.employees",
  "hr.attendance",
  "hr.leave",
  "hr.compensation",
  "hr.payroll",
  "hr.disbursements",
  "hr.statutory",
  "hr.returns",
  "hr.payslips",
] as const;

export type HrResource = (typeof HR_RESOURCES)[number];

/**
 * Everything an HR resource can be asked to do.
 *
 * `submit` and `approve` are separate because HR's workflows are two-step by
 * design — `isTwoStepActionAllowed` already refuses to let one person do both —
 * and `configure` is separate from `edit` because changing a PAYE table is not
 * the same act as editing an employee's address.
 */
export const HR_ACTIONS = [
  "view",
  "create",
  "edit",
  "submit",
  "approve",
  "disburse",
  "configure",
] as const;

export type HrAction = (typeof HR_ACTIONS)[number];

const ALL: HrAction[] = [...HR_ACTIONS];

/**
 * Read-only across the board. What a supervisor who needs to answer questions
 * about pay can do without being able to change anything.
 */
const VIEW_ONLY: HrAction[] = ["view"];

/** Prepare but do not approve. The payroll clerk's spread. */
const PREPARE: HrAction[] = ["view", "create", "edit", "submit"];

/**
 * Mark a register and correct it. What a shift supervisor needs and no more.
 *
 * `edit` is included on purpose despite `Attendance.overtime` feeding a payroll
 * run: a mis-marked register is corrected in the moment, and withholding `edit`
 * would push people to delete-and-recreate, which needs SUPERADMIN and loses the
 * original. Not `submit` or `approve` — nothing about a register is a two-step
 * workflow — and not `configure`.
 */
const MARK_REGISTER: HrAction[] = ["view", "create", "edit"];

type Matrix = Partial<Record<string, Partial<Record<HrResource, HrAction[]>>>>;

/**
 * Role to what it may do.
 *
 * A role absent from this table can do nothing in HR, which is deliberate: the
 * school roles (TEACHER, PARENT, STUDENT, …) exist in the same `UserRole` enum
 * and none of them has any business in the payroll. A teacher signing into a
 * school that also runs payroll here must not reach the salary bill.
 */
const MATRIX: Matrix = {
  SUPERADMIN: {
    "hr.employees": ALL,
    "hr.attendance": ALL,
    "hr.leave": ALL,
    "hr.compensation": ALL,
    "hr.payroll": ALL,
    "hr.disbursements": ALL,
    "hr.statutory": ALL,
    "hr.returns": ALL,
    "hr.payslips": ALL,
  },
  MANAGER: {
    "hr.employees": ALL,
    "hr.attendance": ALL,
    "hr.leave": ALL,
    "hr.compensation": ALL,
    "hr.payroll": ALL,
    "hr.disbursements": ALL,
    "hr.statutory": ALL,
    "hr.returns": ALL,
    "hr.payslips": ALL,
  },
  // The payroll clerk: prepares a run and submits it, and cannot approve their
  // own work or move money. Statutory tables are read-only to them — a rate
  // change is a decision with a filing consequence, and the person who prepares
  // the run should not also be the person who changes what it is computed on.
  CLERK: {
    "hr.employees": PREPARE,
    "hr.attendance": MARK_REGISTER,
    // A clerk records leave and submits it. Approving somebody's time off is the
    // manager's, for the same reason approving a run is.
    "hr.leave": PREPARE,
    "hr.compensation": PREPARE,
    "hr.payroll": PREPARE,
    "hr.disbursements": VIEW_ONLY,
    "hr.statutory": VIEW_ONLY,
    "hr.returns": VIEW_ONLY,
    "hr.payslips": VIEW_ONLY,
  },
  // The register and nothing else. This comment used to say "deliberately
  // nothing" while explaining that an operator marks attendance — which was true
  // only because the attendance API had no role check at all to deny them. Any
  // signed-in user could create and amend attendance on a tenant with the
  // feature, and `Attendance.overtime` is read straight into a payroll run by
  // `overtimePayByEmployee`, so that was a route from "can sign in" to "can pay
  // myself for hours I did not work". They still have no business in anybody's
  // pay; their own payslip reaches them through the self-service check in
  // `lib/documents/hr-sources.ts`, which is a row-level scope, not a role grant.
  OPERATOR: {
    "hr.attendance": MARK_REGISTER,
  },
};

export function canHrRoleDo(
  role: string | null | undefined,
  resource: HrResource,
  action: HrAction,
): boolean {
  if (!role) return false;
  const grants = MATRIX[role.trim().toUpperCase()];
  if (!grants) return false;
  return grants[resource]?.includes(action) ?? false;
}

export type SessionLike = { user: { role?: string | null } };

/**
 * Returns null when allowed, or the message to refuse with.
 *
 * A message rather than a thrown error, for the same reason as the schools
 * version: every HR route already returns through `errorResponse`, and a throw
 * would be caught by the generic handler and reported as a 500 — which tells the
 * caller the server is broken when in fact they simply may not.
 */
export function hrPermissionDenial(
  session: SessionLike,
  resource: HrResource,
  action: HrAction,
): string | null {
  if (canHrRoleDo(session.user.role, resource, action)) return null;
  return `Your role cannot ${action} ${resource.replace("hr.", "")}`;
}

/**
 * Whether this caller may see other people's pay at all.
 *
 * Used by the payslip route to decide between "HR staff, show any" and
 * "employee, show their own". Not the same question as `canHrRoleDo(…, "view")`
 * on a specific resource, because the answer has to be a single boolean the
 * document layer can pass down.
 */
export function hasPayrollVisibility(role: string | null | undefined): boolean {
  return canHrRoleDo(role, "hr.payslips", "view");
}
