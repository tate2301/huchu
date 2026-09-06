/**
 * The emitters this host's modules have not taken with them yet.
 *
 * Each names the entities of one module — payroll runs, gold allocations,
 * permits, work orders, leads — and moves into that module when it is
 * extracted. The service they write through is `@corelithzw/module-notifications`.
 */
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceAction,
  NotificationType,
  type ApprovalActionType,
  type ApprovalTargetType,
} from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"
import {
  createNotification,
  getManagerIds,
  type DbClient,
} from "@corelithzw/module-notifications/service"

export {
  buildNotificationActions,
  parseNotificationPayload,
  type NotificationActionDescriptor,
} from "@corelithzw/module-notifications/service"

export type WorkflowNotificationInput = {
  companyId: string
  entityType: ApprovalTargetType
  entityId: string
  action: ApprovalActionType
  actedById: string
}

function mapApprovalToNotificationType(
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
  if (entityType === "GOLD_SHIFT_ALLOCATION") {
    if (action === "SUBMIT") return NotificationType.HR_GOLD_PAYOUT_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_GOLD_PAYOUT_APPROVED
    if (action === "REJECT") return NotificationType.HR_GOLD_PAYOUT_REJECTED
  }
  if (entityType === "DISCIPLINARY_ACTION") {
    if (action === "SUBMIT") return NotificationType.HR_DISCIPLINARY_SUBMITTED
    if (action === "APPROVE") return NotificationType.HR_DISCIPLINARY_APPROVED
    if (action === "REJECT") return NotificationType.HR_DISCIPLINARY_REJECTED
  }
  return null
}

function approvalSourceAction(action: ApprovalActionType): NotificationSourceAction {
  if (action === "SUBMIT") return NotificationSourceAction.SUBMIT
  if (action === "APPROVE") return NotificationSourceAction.APPROVE
  if (action === "REJECT") return NotificationSourceAction.REJECT
  return NotificationSourceAction.STATUS_CHANGE
}

function toNotificationEntityType(entityType: ApprovalTargetType): NotificationEntityType {
  if (entityType === "PAYROLL_RUN") return NotificationEntityType.PAYROLL_RUN
  if (entityType === "DISBURSEMENT_BATCH") return NotificationEntityType.DISBURSEMENT_BATCH
  if (entityType === "ADJUSTMENT_ENTRY") return NotificationEntityType.ADJUSTMENT_ENTRY
  if (entityType === "COMPENSATION_PROFILE") return NotificationEntityType.COMPENSATION_PROFILE
  if (entityType === "GOLD_SHIFT_ALLOCATION") {
    return NotificationEntityType.GOLD_SHIFT_ALLOCATION
  }
  if (entityType === "DISCIPLINARY_ACTION") return NotificationEntityType.DISCIPLINARY_ACTION
  return NotificationEntityType.COMPENSATION_RULE
}

function safeIdPrefix(id: string) {
  return id.slice(0, 8)
}

type WorkflowEntityContext = {
  submittedById?: string | null
  createdById?: string | null
  label: string
  viewPath: string
  payload: Record<string, unknown>
}

async function getWorkflowEntityContext(
  db: DbClient,
  input: { entityType: ApprovalTargetType; entityId: string },
): Promise<WorkflowEntityContext | null> {
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

  if (input.entityType === "GOLD_SHIFT_ALLOCATION") {
    const allocation = await db.goldShiftAllocation.findUnique({
      where: { id: input.entityId },
      select: {
        id: true,
        date: true,
        shift: true,
        totalWeight: true,
        netWeight: true,
        workerShareWeight: true,
        submittedById: true,
        createdById: true,
        site: { select: { code: true, name: true } },
      },
    })
    if (!allocation) return null
    const shiftDate = allocation.date.toISOString().slice(0, 10)
    return {
      submittedById: allocation.submittedById,
      createdById: allocation.createdById,
      label: `${shiftDate} ${allocation.shift} - ${allocation.site.code}`,
      viewPath: `/gold/settlement/approvals?allocationId=${allocation.id}`,
      payload: {
        shiftDate,
        shift: allocation.shift,
        siteCode: allocation.site.code,
        siteName: allocation.site.name,
        totalWeight: allocation.totalWeight,
        netWeight: allocation.netWeight,
        workerShareWeight: allocation.workerShareWeight,
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

function buildWorkflowCopy(input: {
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
    case NotificationType.HR_GOLD_PAYOUT_SUBMITTED:
      return {
        title: "Settlement allocation pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_GOLD_PAYOUT_APPROVED:
      return {
        title: "Settlement allocation approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_GOLD_PAYOUT_REJECTED:
      return {
        title: "Settlement allocation rejected",
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

function buildWorkflowSeverity(type: NotificationType) {
  return type.endsWith("_REJECTED")
    ? NotificationSeverity.WARNING
    : NotificationSeverity.INFO
}

export async function emitWorkflowNotificationFromApprovalAction(
  db: DbClient,
  input: WorkflowNotificationInput,
) {
  try {
    const notificationType = mapApprovalToNotificationType(input.entityType, input.action)
    if (!notificationType) return null

    const actor = await db.user.findUnique({
      where: { id: input.actedById },
      select: { id: true, name: true, role: true },
    })
    if (!actor) return null

    const entityContext = await getWorkflowEntityContext(db, {
      entityType: input.entityType,
      entityId: input.entityId,
    })
    if (!entityContext) return null

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
          entityContext.submittedById ?? "",
          entityContext.createdById ?? "",
          ...priorActors.map((entry) => entry.actedById),
        ]),
      ).filter((userId) => userId && userId !== actor.id)
    } else {
      return null
    }

    const copy = buildWorkflowCopy({
      type: notificationType,
      actorName: actor.name,
      label: entityContext.label,
    })

    return createNotification(db, {
      companyId: input.companyId,
      type: notificationType,
      title: copy.title,
      summary: copy.summary,
      severity: buildWorkflowSeverity(notificationType),
      category: "HR",
      recipientIds,
      payload: {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        label: entityContext.label,
        viewPath: entityContext.viewPath,
        ...entityContext.payload,
      },
      entityType: toNotificationEntityType(input.entityType),
      entityId: input.entityId,
      sourceAction: approvalSourceAction(input.action),
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit workflow notification:", error)
    return null
  }
}

function normalizeIncidentSeverity(rawSeverity: string) {
  const severity = rawSeverity.toUpperCase()
  if (severity === "CRITICAL" || severity === "HIGH") return NotificationSeverity.CRITICAL
  if (severity === "MEDIUM") return NotificationSeverity.WARNING
  return NotificationSeverity.INFO
}

function normalizePermitSeverity(status: string) {
  return status === "EXPIRED" ? NotificationSeverity.CRITICAL : NotificationSeverity.WARNING
}

function normalizeWorkOrderSeverity(status: string) {
  return status === "OPEN" ? NotificationSeverity.WARNING : NotificationSeverity.INFO
}

async function getOpsRecipientIds(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    severity: NotificationSeverity
  },
) {
  const approvers = await db.user.findMany({
    where: {
      companyId: input.companyId,
      role: { in: ["MANAGER", "SUPERADMIN"] },
      isActive: true,
    },
    select: { id: true },
  })

  const recipientIds = new Set(approvers.map((user) => user.id))
  if (input.actorRole === "CLERK" && input.severity !== NotificationSeverity.CRITICAL) {
    recipientIds.add(input.actorId)
  }

  return Array.from(recipientIds)
}

async function getHrRecipientIds(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    severity: NotificationSeverity
  },
) {
  const approvers = await db.user.findMany({
    where: {
      companyId: input.companyId,
      role: { in: ["MANAGER", "SUPERADMIN"] },
      isActive: true,
    },
    select: { id: true },
  })

  const recipientIds = new Set(approvers.map((user) => user.id))
  if (input.actorRole === "CLERK" && input.severity !== NotificationSeverity.CRITICAL) {
    recipientIds.add(input.actorId)
  }

  return Array.from(recipientIds)
}

export async function emitHrIncidentNotification(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    event: "CREATED" | "STATUS_CHANGED"
    incident: {
      id: string
      title: string
      severity: string
      status: string
      employee: { id: string; employeeId: string; name: string }
      site?: { id?: string; name?: string; code?: string } | null
    }
    previousStatus?: string | null
  },
) {
  try {
    const severity = normalizeIncidentSeverity(input.incident.severity)
    const recipientIds = await getHrRecipientIds(db, {
      companyId: input.companyId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      severity,
    })

    const type =
      input.event === "CREATED"
        ? NotificationType.HR_INCIDENT_CREATED
        : NotificationType.HR_INCIDENT_STATUS_CHANGED
    const title =
      input.event === "CREATED"
        ? `HR incident reported: ${input.incident.title}`
        : `HR incident status changed: ${input.incident.status}`
    const summary =
      input.event === "CREATED"
        ? `${input.incident.employee.name} (${input.incident.employee.employeeId}) has a new HR incident.`
        : `${input.incident.employee.name} moved from ${input.previousStatus ?? "UNKNOWN"} to ${input.incident.status}.`

    return createNotification(db, {
      companyId: input.companyId,
      type,
      title,
      summary,
      severity,
      category: "HR",
      recipientIds,
      payload: {
        incidentTitle: input.incident.title,
        status: input.incident.status,
        severity: input.incident.severity,
        employeeName: input.incident.employee.name,
        employeeId: input.incident.employee.employeeId,
        siteName: input.incident.site?.name ?? null,
        siteCode: input.incident.site?.code ?? null,
        previousStatus: input.previousStatus ?? null,
        viewPath: `/people/incidents?incidentId=${input.incident.id}`,
      },
      entityType: NotificationEntityType.HR_INCIDENT,
      entityId: input.incident.id,
      sourceAction:
        input.event === "CREATED"
          ? NotificationSourceAction.CREATE
          : NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit HR incident notification:", error)
    return null
  }
}

export async function emitIncidentNotification(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    event: "CREATED" | "STATUS_CHANGED"
    incident: {
      id: string
      incidentType: string
      severity: string
      status: string
      site?: { id?: string; name?: string; code?: string } | null
    }
    previousStatus?: string | null
  },
) {
  try {
    const severity = normalizeIncidentSeverity(input.incident.severity)
    const recipientIds = await getOpsRecipientIds(db, {
      companyId: input.companyId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      severity,
    })

    const type =
      input.event === "CREATED"
        ? NotificationType.OPS_INCIDENT_CREATED
        : NotificationType.OPS_INCIDENT_STATUS_CHANGED
    const title =
      input.event === "CREATED"
        ? `Incident reported: ${input.incident.incidentType}`
        : `Incident status changed: ${input.incident.status}`
    const siteCode = input.incident.site?.code ?? "site"
    const summary =
      input.event === "CREATED"
        ? `${input.incident.incidentType} reported at ${siteCode}.`
        : `Incident at ${siteCode} moved from ${input.previousStatus ?? "UNKNOWN"} to ${input.incident.status}.`

    return createNotification(db, {
      companyId: input.companyId,
      type,
      title,
      summary,
      severity,
      category: "OPS",
      recipientIds,
      payload: {
        incidentType: input.incident.incidentType,
        severity: input.incident.severity,
        status: input.incident.status,
        previousStatus: input.previousStatus ?? null,
        siteName: input.incident.site?.name ?? null,
        siteCode: input.incident.site?.code ?? null,
        viewPath: `/compliance/incidents?createdId=${input.incident.id}`,
      },
      entityType: NotificationEntityType.INCIDENT,
      entityId: input.incident.id,
      sourceAction:
        input.event === "CREATED"
          ? NotificationSourceAction.CREATE
          : NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit incident notification:", error)
    return null
  }
}

export async function emitPermitRiskNotification(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    permit: {
      id: string
      permitNumber: string
      permitType: string
      status: string
      expiryDate: Date
      site?: { id?: string; name?: string; code?: string } | null
    }
  },
) {
  try {
    if (input.permit.status !== "EXPIRING_SOON" && input.permit.status !== "EXPIRED") {
      return null
    }

    const severity = normalizePermitSeverity(input.permit.status)
    const recipientIds = await getOpsRecipientIds(db, {
      companyId: input.companyId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      severity,
    })
    const type =
      input.permit.status === "EXPIRED"
        ? NotificationType.OPS_PERMIT_EXPIRED
        : NotificationType.OPS_PERMIT_EXPIRING
    const title =
      input.permit.status === "EXPIRED"
        ? `Permit expired: ${input.permit.permitNumber}`
        : `Permit expiring soon: ${input.permit.permitNumber}`
    const siteCode = input.permit.site?.code ?? "site"
    const summary = `${input.permit.permitType} permit at ${siteCode} is ${input.permit.status.toLowerCase()}.`

    return createNotification(db, {
      companyId: input.companyId,
      type,
      title,
      summary,
      severity,
      category: "OPS",
      recipientIds,
      payload: {
        permitNumber: input.permit.permitNumber,
        permitType: input.permit.permitType,
        status: input.permit.status,
        expiryDate: input.permit.expiryDate.toISOString(),
        siteName: input.permit.site?.name ?? null,
        siteCode: input.permit.site?.code ?? null,
        viewPath: `/compliance/permits?createdId=${input.permit.id}`,
      },
      entityType: NotificationEntityType.PERMIT,
      entityId: input.permit.id,
      sourceAction: NotificationSourceAction.EXPIRY_ALERT,
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit permit notification:", error)
    return null
  }
}

export async function emitWorkOrderStatusNotification(
  db: DbClient,
  input: {
    companyId: string
    actorId: string
    actorRole?: string
    workOrder: {
      id: string
      issue: string
      status: string
      equipment?: { id?: string; equipmentCode?: string; name?: string } | null
    }
  },
) {
  try {
    if (input.workOrder.status !== "OPEN" && input.workOrder.status !== "IN_PROGRESS") {
      return null
    }

    const severity = normalizeWorkOrderSeverity(input.workOrder.status)
    const recipientIds = await getOpsRecipientIds(db, {
      companyId: input.companyId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      severity,
    })
    const type =
      input.workOrder.status === "OPEN"
        ? NotificationType.OPS_WORK_ORDER_OPENED
        : NotificationType.OPS_WORK_ORDER_IN_PROGRESS
    const title =
      input.workOrder.status === "OPEN"
        ? "Work order opened"
        : "Work order in progress"
    const equipmentCode = input.workOrder.equipment?.equipmentCode ?? "equipment"
    const summary = `${equipmentCode}: ${input.workOrder.issue}`

    return createNotification(db, {
      companyId: input.companyId,
      type,
      title,
      summary,
      severity,
      category: "OPS",
      recipientIds,
      payload: {
        issue: input.workOrder.issue,
        status: input.workOrder.status,
        equipmentCode: input.workOrder.equipment?.equipmentCode ?? null,
        equipmentName: input.workOrder.equipment?.name ?? null,
        viewPath: `/maintenance/work-orders?workOrderId=${input.workOrder.id}`,
      },
      entityType: NotificationEntityType.WORK_ORDER,
      entityId: input.workOrder.id,
      sourceAction:
        input.workOrder.status === "OPEN"
          ? NotificationSourceAction.CREATE
          : NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] Failed to emit work order notification:", error)
    return null
  }
}

export async function emitGoldExceptionNotification(args: {
  companyId: string
  exceptionId: string
  category: string
  severity: "INFO" | "WARN" | "CRITICAL"
  entityType?: string | null
  entityId?: string | null
}): Promise<void> {
  if (args.severity !== "CRITICAL") return
  try {
    const recipientIds = await getManagerIds(args.companyId)
    await createNotification(prisma, {
      companyId: args.companyId,
      type: NotificationType.OPS_INCIDENT_CREATED,
      title: `Gold exception: ${args.category}`,
      summary: `A critical gold exception (${args.category}) requires attention.`,
      severity: NotificationSeverity.CRITICAL,
      category: "OPS",
      recipientIds,
      payload: {
        exceptionId: args.exceptionId,
        category: args.category,
        severity: args.severity,
        entityType: args.entityType ?? null,
        entityId: args.entityId ?? null,
        viewPath: `/gold/exceptions?id=${args.exceptionId}`,
      },
      entityType: NotificationEntityType.INCIDENT,
      entityId: args.exceptionId,
      sourceAction: NotificationSourceAction.CREATE,
    })
  } catch (error) {
    console.error("[Notifications] emitGoldExceptionNotification failed:", error)
  }
}

export async function emitGoldImportFailedNotification(args: {
  companyId: string
  importId: string
  rowsFailed: number
  uploaderId: string
}): Promise<void> {
  try {
    const recipientIds = await getManagerIds(args.companyId)
    const allIds = Array.from(new Set([...recipientIds, args.uploaderId]))
    await createNotification(prisma, {
      companyId: args.companyId,
      type: NotificationType.OPS_INCIDENT_CREATED,
      title: "Gold import completed with failures",
      summary: `Import finished with ${args.rowsFailed} failed row${args.rowsFailed !== 1 ? "s" : ""}. Review and retry the failed entries.`,
      severity: NotificationSeverity.WARNING,
      category: "OPS",
      recipientIds: allIds,
      payload: {
        importId: args.importId,
        rowsFailed: args.rowsFailed,
        viewPath: `/gold/import?importId=${args.importId}`,
      },
      entityType: NotificationEntityType.INCIDENT,
      entityId: args.importId,
      sourceAction: NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] emitGoldImportFailedNotification failed:", error)
  }
}

export async function emitGoldDispatchReceiptedNotification(args: {
  companyId: string
  dispatchId: string
  receiptId: string
  handedOverById: string
}): Promise<void> {
  try {
    const recipientIds = await getManagerIds(args.companyId, args.handedOverById)
    await createNotification(prisma, {
      companyId: args.companyId,
      type: NotificationType.OPS_INCIDENT_STATUS_CHANGED,
      title: "Gold dispatch receipted",
      summary: "A gold dispatch has been receipted by the buyer.",
      severity: NotificationSeverity.INFO,
      category: "OPS",
      recipientIds,
      payload: {
        dispatchId: args.dispatchId,
        receiptId: args.receiptId,
        handedOverById: args.handedOverById,
        viewPath: `/gold/dispatches?id=${args.dispatchId}`,
      },
      entityType: NotificationEntityType.INCIDENT,
      entityId: args.dispatchId,
      sourceAction: NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] emitGoldDispatchReceiptedNotification failed:", error)
  }
}

export async function emitCrmNotification(args: {
  companyId: string
  recipientIds: string[]
  type: NotificationType
  title: string
  summary: string
  leadId?: string
  /**
   * What the notice is really about, when it isn't a lead. Tasks and comments
   * hang off deals, people and companies just as often, and pointing every
   * notice at a lead id it doesn't have makes the "open the record" action
   * dead.
   */
  entityType?: NotificationEntityType
  entityId?: string
  viewPath: string
  severity?: NotificationSeverity
}): Promise<void> {
  try {
    const recipientIds = args.recipientIds.filter(Boolean)
    if (recipientIds.length === 0) return
    await createNotification(prisma, {
      companyId: args.companyId,
      type: args.type,
      title: args.title,
      summary: args.summary,
      severity: args.severity ?? NotificationSeverity.INFO,
      category: "CRM",
      recipientIds,
      payload: { leadId: args.leadId, viewPath: args.viewPath },
      entityType: args.entityType ?? NotificationEntityType.CRM_LEAD,
      entityId: args.entityId ?? args.leadId,
      sourceAction: NotificationSourceAction.STATUS_CHANGE,
    })
  } catch (error) {
    console.error("[Notifications] emitCrmNotification failed:", error)
  }
}

export async function getCrmManagerRecipients(companyId: string, excludeId?: string): Promise<string[]> {
  return getManagerIds(companyId, excludeId)
}
