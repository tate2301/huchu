/**
 * An approval action, told to the people it concerns.
 *
 * A module that owns approvable entities describes each notice with a
 * resolver — the notification type, the entity's label and where to view it,
 * the copy — and `emitApprovalNotice` writes it: to the approvers on a
 * submission, to the submitter and everyone who acted before on an approval or
 * a rejection. The people module resolves its own entities below (payroll
 * runs, disbursement batches, adjustments, compensation profiles and rules,
 * disciplinary actions); the gold module resolves its settlement allocations
 * with the same emitter. A host registers each module's emitter with the
 * workflow module's `onApprovalAction`.
 */
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceAction,
  NotificationType,
  type ApprovalActionType,
  type ApprovalTargetType,
} from "@corelithzw/db"
import { createNotification, type DbClient, type NotificationCategory } from "@corelithzw/module-notifications/service"

export type ApprovalNoticeInput = {
  companyId: string
  entityType: ApprovalTargetType
  entityId: string
  action: ApprovalActionType
  actedById: string
}

export type ApprovalEntityContext = {
  submittedById?: string | null
  createdById?: string | null
  label: string
  viewPath: string
  payload: Record<string, unknown>
}

export type ApprovalNotice = {
  type: NotificationType
  entityType: NotificationEntityType
  category: NotificationCategory
  context: ApprovalEntityContext
  /** The title and the summary, once the actor's name is known. */
  copy: (actorName: string) => { title: string; summary: string }
}

/** Null when the module does not own the entity, or the action is not one it announces. */
export type ApprovalNoticeResolver = (db: DbClient, input: ApprovalNoticeInput) => Promise<ApprovalNotice | null>

function approvalSourceAction(action: ApprovalActionType): NotificationSourceAction {
  if (action === "SUBMIT") return NotificationSourceAction.SUBMIT
  if (action === "APPROVE") return NotificationSourceAction.APPROVE
  if (action === "REJECT") return NotificationSourceAction.REJECT
  return NotificationSourceAction.STATUS_CHANGE
}

function approvalSeverity(type: NotificationType) {
  return type.endsWith("_REJECTED")
    ? NotificationSeverity.WARNING
    : NotificationSeverity.INFO
}

export async function emitApprovalNotice(db: DbClient, input: ApprovalNoticeInput, resolve: ApprovalNoticeResolver) {
  try {
    const notice = await resolve(db, input)
    if (!notice) return null

    const actor = await db.user.findUnique({
      where: { id: input.actedById },
      select: { id: true, name: true, role: true },
    })
    if (!actor) return null

    let recipientIds: string[] = []

    if (input.action === "SUBMIT") {
      const approvers = await db.user.findMany({
        where: {
          companyId: input.companyId,
          role: { in: ["MANAGER", "SUPERADMIN"] },
          isActive: true,
        },
        select: { id: true },
      })
      recipientIds = approvers
        .map((user) => user.id)
        .filter((userId) => userId !== actor.id || actor.role === "SUPERADMIN")
    } else if (input.action === "APPROVE" || input.action === "REJECT") {
      const priorActors = await db.approvalAction.findMany({
        where: {
          companyId: input.companyId,
          entityType: input.entityType,
          entityId: input.entityId,
        },
        select: { actedById: true },
      })
      recipientIds = Array.from(
        new Set([
          notice.context.submittedById ?? "",
          notice.context.createdById ?? "",
          ...priorActors.map((entry) => entry.actedById),
        ]),
      ).filter((userId) => userId && userId !== actor.id)
    } else {
      return null
    }

    const copy = notice.copy(actor.name)

    return createNotification(db, {
      companyId: input.companyId,
      type: notice.type,
      title: copy.title,
      summary: copy.summary,
      severity: approvalSeverity(notice.type),
      category: notice.category,
      recipientIds,
      payload: {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        label: notice.context.label,
        viewPath: notice.context.viewPath,
        ...notice.context.payload,
      },
      entityType: notice.entityType,
      entityId: input.entityId,
      sourceAction: approvalSourceAction(input.action),
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit workflow notification:", error)
    return null
  }
}

// ---- The people module's own entities.

function mapPeopleApproval(
  entityType: ApprovalTargetType,
  action: ApprovalActionType,
): NotificationType | null {
  if (entityType === "PAYROLL_RUN") {
    if (action === "SUBMIT") return NotificationType.HR_PAYROLL_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_PAYROLL_APPROVED
    if (action === "REJECT") return NotificationType.HR_PAYROLL_REJECTED
  }
  if (entityType === "DISBURSEMENT_BATCH") {
    if (action === "SUBMIT") return NotificationType.HR_DISBURSEMENT_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_DISBURSEMENT_APPROVED
    if (action === "REJECT") return NotificationType.HR_DISBURSEMENT_REJECTED
  }
  if (entityType === "ADJUSTMENT_ENTRY") {
    if (action === "SUBMIT") return NotificationType.HR_ADJUSTMENT_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_ADJUSTMENT_APPROVED
    if (action === "REJECT") return NotificationType.HR_ADJUSTMENT_REJECTED
  }
  if (entityType === "COMPENSATION_PROFILE") {
    if (action === "SUBMIT") return NotificationType.HR_COMP_PROFILE_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_COMP_PROFILE_APPROVED
    if (action === "REJECT") return NotificationType.HR_COMP_PROFILE_REJECTED
  }
  if (entityType === "COMPENSATION_RULE") {
    if (action === "SUBMIT") return NotificationType.HR_COMP_RULE_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_COMP_RULE_APPROVED
    if (action === "REJECT") return NotificationType.HR_COMP_RULE_REJECTED
  }
  if (entityType === "DISCIPLINARY_ACTION") {
    if (action === "SUBMIT") return NotificationType.HR_DISCIPLINARY_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_DISCIPLINARY_APPROVED
    if (action === "REJECT") return NotificationType.HR_DISCIPLINARY_REJECTED
  }
  return null
}

function toPeopleEntityType(entityType: ApprovalTargetType): NotificationEntityType {
  if (entityType === "PAYROLL_RUN") return NotificationEntityType.PAYROLL_RUN
  if (entityType === "DISBURSEMENT_BATCH") return NotificationEntityType.DISBURSEMENT_BATCH
  if (entityType === "ADJUSTMENT_ENTRY") return NotificationEntityType.ADJUSTMENT_ENTRY
  if (entityType === "COMPENSATION_PROFILE") return NotificationEntityType.COMPENSATION_PROFILE
  if (entityType === "DISCIPLINARY_ACTION") return NotificationEntityType.DISCIPLINARY_ACTION
  return NotificationEntityType.COMPENSATION_RULE
}

function safeIdPrefix(id: string) {
  return id.slice(0, 8)
}

async function getPeopleEntityContext(
  db: DbClient,
  input: { entityType: ApprovalTargetType; entityId: string },
): Promise<ApprovalEntityContext | null> {
  if (input.entityType === "PAYROLL_RUN") {
    const run = await db.payrollRun.findUnique({
      where: { id: input.entityId },
      select: {
        id: true,
        runNumber: true,
        submittedById: true,
        createdById: true,
        period: { select: { periodKey: true } },
      },
    })
    if (!run) return null
    const label = `Run #${run.runNumber} (${run.period.periodKey})`
    return {
      submittedById: run.submittedById,
      createdById: run.createdById,
      label,
      viewPath: `/payroll/runs?runId=${run.id}`,
      payload: {
        runNumber: run.runNumber,
        periodKey: run.period.periodKey,
      },
    }
  }

  if (input.entityType === "DISBURSEMENT_BATCH") {
    const batch = await db.disbursementBatch.findUnique({
      where: { id: input.entityId },
      select: {
        id: true,
        code: true,
        submittedById: true,
        createdById: true,
        payrollRun: {
          select: {
            runNumber: true,
            period: { select: { periodKey: true } },
          },
        },
      },
    })
    if (!batch) return null
    return {
      submittedById: batch.submittedById,
      createdById: batch.createdById,
      label: batch.code,
      viewPath: `/payroll/disbursements?batchId=${batch.id}`,
      payload: {
        code: batch.code,
        runNumber: batch.payrollRun.runNumber,
        periodKey: batch.payrollRun.period.periodKey,
      },
    }
  }

  if (input.entityType === "ADJUSTMENT_ENTRY") {
    const adjustment = await db.adjustmentEntry.findUnique({
      where: { id: input.entityId },
      select: {
        id: true,
        reason: true,
        amountDelta: true,
        targetType: true,
        payrollRunId: true,
        disbursementBatchId: true,
        submittedById: true,
        createdById: true,
      },
    })
    if (!adjustment) return null
    const viewPath =
      adjustment.targetType === "DISBURSEMENT_BATCH" || adjustment.disbursementBatchId
        ? `/payroll/disbursements?adjustmentId=${adjustment.id}`
        : `/payroll/runs?adjustmentId=${adjustment.id}`
    return {
      submittedById: adjustment.submittedById,
      createdById: adjustment.createdById,
      label: `Adjustment ${safeIdPrefix(adjustment.id)}`,
      viewPath,
      payload: {
        reason: adjustment.reason,
        amountDelta: adjustment.amountDelta,
        targetType: adjustment.targetType,
      },
    }
  }

  if (input.entityType === "COMPENSATION_PROFILE") {
    const profile = await db.compensationProfile.findUnique({
      where: { id: input.entityId },
      select: {
        id: true,
        submittedById: true,
        createdById: true,
        employee: { select: { name: true, employeeId: true } },
      },
    })
    if (!profile) return null
    return {
      submittedById: profile.submittedById,
      createdById: profile.createdById,
      label: `${profile.employee.name} (${profile.employee.employeeId})`,
      viewPath: `/payroll/compensation?profileId=${profile.id}`,
      payload: {
        employeeName: profile.employee.name,
        employeeId: profile.employee.employeeId,
      },
    }
  }

  if (input.entityType === "DISCIPLINARY_ACTION") {
    const action = await db.disciplinaryAction.findUnique({
      where: { id: input.entityId },
      select: {
        id: true,
        actionType: true,
        status: true,
        penaltyAmount: true,
        penaltyCurrency: true,
        submittedById: true,
        createdById: true,
        employee: { select: { name: true, employeeId: true } },
      },
    })
    if (!action) return null
    const label = `${action.actionType} for ${action.employee.name} (${action.employee.employeeId})`
    return {
      submittedById: action.submittedById,
      createdById: action.createdById,
      label,
      viewPath: `/people/incidents?disciplinaryId=${action.id}`,
      payload: {
        actionType: action.actionType,
        status: action.status,
        employeeName: action.employee.name,
        employeeId: action.employee.employeeId,
        penaltyAmount: action.penaltyAmount,
        penaltyCurrency: action.penaltyCurrency,
      },
    }
  }

  const rule = await db.compensationRule.findUnique({
    where: { id: input.entityId },
    select: {
      id: true,
      name: true,
      submittedById: true,
      createdById: true,
    },
  })
  if (!rule) return null
  return {
    submittedById: rule.submittedById,
    createdById: rule.createdById,
    label: rule.name,
    viewPath: `/payroll/compensation?ruleId=${rule.id}`,
    payload: {
      ruleName: rule.name,
    },
  }
}

function buildPeopleCopy(input: {
  type: NotificationType
  actorName: string
  label: string
}) {
  switch (input.type) {
    case NotificationType.HR_PAYROLL_SUBMITTED:
      return {
        title: "Payroll run pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_PAYROLL_APPROVED:
      return {
        title: "Payroll run approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_PAYROLL_REJECTED:
      return {
        title: "Payroll run rejected",
        summary: `${input.actorName} rejected ${input.label}.`,
      }
    case NotificationType.HR_DISBURSEMENT_SUBMITTED:
      return {
        title: "Disbursement batch pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_DISBURSEMENT_APPROVED:
      return {
        title: "Disbursement batch approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_DISBURSEMENT_REJECTED:
      return {
        title: "Disbursement batch rejected",
        summary: `${input.actorName} rejected ${input.label}.`,
      }
    case NotificationType.HR_ADJUSTMENT_SUBMITTED:
      return {
        title: "Adjustment pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_ADJUSTMENT_APPROVED:
      return {
        title: "Adjustment approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_ADJUSTMENT_REJECTED:
      return {
        title: "Adjustment rejected",
        summary: `${input.actorName} rejected ${input.label}.`,
      }
    case NotificationType.HR_COMP_PROFILE_SUBMITTED:
      return {
        title: "Compensation profile pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_COMP_PROFILE_APPROVED:
      return {
        title: "Compensation profile approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_COMP_PROFILE_REJECTED:
      return {
        title: "Compensation profile rejected",
        summary: `${input.actorName} rejected ${input.label}.`,
      }
    case NotificationType.HR_COMP_RULE_SUBMITTED:
      return {
        title: "Compensation rule pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_COMP_RULE_APPROVED:
      return {
        title: "Compensation rule approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_COMP_RULE_REJECTED:
      return {
        title: "Compensation rule rejected",
        summary: `${input.actorName} rejected ${input.label}.`,
      }
    case NotificationType.HR_DISCIPLINARY_SUBMITTED:
      return {
        title: "Disciplinary action pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_DISCIPLINARY_APPROVED:
      return {
        title: "Disciplinary action approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_DISCIPLINARY_REJECTED:
      return {
        title: "Disciplinary action rejected",
        summary: `${input.actorName} rejected ${input.label}.`,
      }
    default:
      return {
        title: "Workflow update",
        summary: `${input.actorName} updated ${input.label}.`,
      }
  }
}

export const resolvePeopleApprovalNotice: ApprovalNoticeResolver = async (db, input) => {
  const type = mapPeopleApproval(input.entityType, input.action)
  if (!type) return null
  const context = await getPeopleEntityContext(db, { entityType: input.entityType, entityId: input.entityId })
  if (!context) return null
  return {
    type,
    entityType: toPeopleEntityType(input.entityType),
    category: "HR",
    context,
    copy: (actorName) => buildPeopleCopy({ type, actorName, label: context.label }),
  }
}

/**
 * After an approval action on a payroll run, a disbursement batch, an
 * adjustment, a compensation profile or rule, or a disciplinary action: the
 * approvers, or the submitter and the prior approvers, are told.
 */
export function emitPeopleApprovalNotification(db: DbClient, input: ApprovalNoticeInput) {
  return emitApprovalNotice(db, input, resolvePeopleApprovalNotice)
}
