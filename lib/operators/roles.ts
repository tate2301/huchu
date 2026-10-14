import type { OperatorRole } from "@prisma/client";

/**
 * What each operator role may do. The one table every write checks.
 *
 * Reading is open to every operator: support has to see a workspace's plan to
 * answer a billing question, and billing has to see its members to know whom
 * to chase. What differs is what each may change.
 */
export const OPERATOR_ACTIONS = [
  "workspace.setUp",
  "workspace.edit",
  "workspace.suspend",
  "workspace.close",
  "workspace.changeOwner",
  "workspace.signEveryoneOut",
  "workspace.export",
  "member.manage",
  /** Sign in as a member, looking only. */
  "member.signInAs",
  /** Sign in as a member, able to make changes. */
  "member.signInAsChange",
  "billing.manage",
  "payment.review",
  "operator.manage",
] as const;

export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];

const SUPPORT: readonly OperatorAction[] = [
  "workspace.setUp",
  "workspace.edit",
  "workspace.suspend",
  "workspace.signEveryoneOut",
  "workspace.export",
  "member.manage",
  "member.signInAs",
  "member.signInAsChange",
];

/** Billing reads a workspace as a member to answer a question about a bill; it changes nothing there. */
const BILLING: readonly OperatorAction[] = ["workspace.setUp", "billing.manage", "payment.review", "member.signInAs"];

const ALLOWED: Record<OperatorRole, ReadonlySet<OperatorAction>> = {
  OWNER: new Set(OPERATOR_ACTIONS),
  SUPPORT: new Set(SUPPORT),
  BILLING: new Set(BILLING),
};

export function operatorCan(role: OperatorRole, action: OperatorAction): boolean {
  return ALLOWED[role].has(action);
}

/** The role as the portal says it. */
export const OPERATOR_ROLE_LABEL: Record<OperatorRole, string> = {
  OWNER: "Owner",
  SUPPORT: "Support",
  BILLING: "Billing",
};
