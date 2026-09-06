import type {
  ApprovalActionType,
  ApprovalTargetType,
  Prisma,
} from "@corelithzw/db"
import type { AuthenticatedSession } from "@/lib/api-utils"
import { emitWorkflowNotificationFromApprovalAction } from "@/lib/notifications"

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
 * Write the audit row and notify.
 *
 * Both, always, and inside the caller's transaction. Splitting the notification
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

  await emitWorkflowNotificationFromApprovalAction(tx, {
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actedById: input.actedById,
  })
}
