import type {
  ApprovalActionType,
  ApprovalTargetType,
  Prisma,
} from "@corelithzw/db"
import type { AuthenticatedSession } from "@corelithzw/platform/api-utils"
import { registry } from "@corelithzw/platform/registry"

/**
 * The submit → approve → reject workflow, and its audit trail.
 *
 * This is deliberately not an HR module. `ApprovalAction` is a polymorphic audit
 * log with no foreign key to its target, and eight domains write to it — payroll
 * runs, disbursements, adjustments, compensation profiles and rules, gold shift
 * allocations, settlement intakes and disciplinary actions. It lived in
 * `lib/hr-payroll.ts` alongside a gold-settlement query builder and the payroll
 * arithmetic, which is how a mining concept ended up on the import path of every
 * approval in the product.
 */

type ApprovalActionInput = {
  companyId: string
  // The Prisma enum, not a hand-written union. The list was maintained by hand
  // and drifted from the schema.
  entityType: ApprovalTargetType
  entityId: string
  action: ApprovalActionType
  actedById: string
  fromStatus?: string | null
  toStatus?: string | null
  note?: string | null
}

/**
 * What happened, for whoever wants to know.
 *
 * Recording an approval action and telling people about it were one function,
 * which made this module import the notifications module and, through it, the
 * payroll, gold and settlement entities those notifications describe. Now the
 * module records and fires; a host registers the listeners it composes
 * (`onApprovalAction` from its `modules.ts`), and the notifications module is
 * the first of them. Listeners run inside the caller's transaction, in
 * registration order, so a workflow step is never recorded but silent.
 */
export type ApprovalActionEvent = Pick<
  ApprovalActionInput,
  "companyId" | "entityType" | "entityId" | "action" | "actedById"
>

export type ApprovalActionListener = (
  tx: Prisma.TransactionClient,
  event: ApprovalActionEvent,
) => Promise<unknown>

const listeners = registry<Set<ApprovalActionListener>>(
  "workflow.approval-action-listeners",
  () => new Set(),
)

export function onApprovalAction(listener: ApprovalActionListener) {
  listeners.add(listener)
}

export type StandardWorkflowStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"

export type StandardWorkflowAction = "SUBMIT" | "APPROVE" | "REJECT"

const STANDARD_WORKFLOW_TRANSITIONS: Record<
  StandardWorkflowAction,
  StandardWorkflowStatus[]
> = {
  SUBMIT: ["DRAFT", "REJECTED"],
  APPROVE: ["SUBMITTED"],
  REJECT: ["SUBMITTED"],
}

export function canTransitionStandardWorkflow(
  fromStatus: StandardWorkflowStatus,
  action: StandardWorkflowAction,
) {
  return STANDARD_WORKFLOW_TRANSITIONS[action].includes(fromStatus)
}

export function normalizeWorkflowNote(
  note: string | null | undefined,
  fallback: string,
) {
  const trimmed = note?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

export function isApproverRole(role: string | undefined) {
  return role === "MANAGER" || role === "SUPERADMIN"
}

export function ensureApproverRole(session: AuthenticatedSession) {
  return isApproverRole(session.user.role)
}

export function isTwoStepActionAllowed(
  submittedById: string | null | undefined,
  actorId: string,
  actorRole?: string,
  options?: {
    allowSuperadminSelfAction?: boolean
  },
) {
  if (options?.allowSuperadminSelfAction && actorRole === "SUPERADMIN") {
    return true
  }
  return !submittedById || submittedById !== actorId
}

/**
 * Write the audit row and tell the listeners.
 *
 * Both, always, and inside the caller's transaction. Splitting the listeners
 * out would mean a workflow step that is recorded but silent, which is how an
 * approval waiting on someone goes unnoticed.
 */
export async function createApprovalAction(
  tx: Prisma.TransactionClient,
  input: ApprovalActionInput,
) {
  await tx.approvalAction.create({
    data: {
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actedById: input.actedById,
      fromStatus: input.fromStatus ?? undefined,
      toStatus: input.toStatus ?? undefined,
      note: input.note ?? undefined,
    },
  })

  const event: ApprovalActionEvent = {
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actedById: input.actedById,
  }
  for (const listener of listeners) {
    await listener(tx, event)
  }
}
