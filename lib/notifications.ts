import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceAction,
  NotificationType,
  Prisma,
  PrismaClient,
  type ApprovalActionType,
  type ApprovalTargetType,
  type UserNotificationPreference,
} from "@prisma/client"

type DbClient = Prisma.TransactionClient | PrismaClient

type NotificationCategory = "HR" | "OPS"

export type NotificationActionDescriptor = {
  key: string
  label: string
  kind: "api" | "link"
  href: string
  method?: "POST" | "PATCH" | "DELETE"
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost"
  confirmMessage?: string
}

export type WorkflowNotificationInput = {
  companyId: string
  entityType: ApprovalTargetType
  entityId: string
  action: ApprovalActionType
  actedById: string
}

type CreateNotificationInput = {
  companyId: string
  type: NotificationType
  title: string
  summary: string
  severity: NotificationSeverity
  category: NotificationCategory
  recipientIds: string[]
  payload?: Record<string, unknown>
  entityType?: NotificationEntityType
  entityId?: string
  sourceAction?: NotificationSourceAction
  expiresAt?: Date | null
}

function isApproverRole(role: string | undefined) {
  return role === "MANAGER" || role === "SUPERADMIN"
}

function isOpsEnabledForPreference(pref: UserNotificationPreference | undefined) {
  if (!pref) return true
  return pref.inAppEnabled && pref.opsEnabled
}

function isHrEnabledForPreference(pref: UserNotificationPreference | undefined) {
  if (!pref) return true
  return pref.inAppEnabled && pref.hrEnabled
}

async function filterRecipientsForCategory(
  db: DbClient,
  input: { companyId: string; userIds: string[]; category: NotificationCategory },
) {
  const dedupedUserIds = Array.from(new Set(input.userIds.filter(Boolean)))
  if (dedupedUserIds.length === 0) return []

  const activeUsers = await db.user.findMany({
    where: {
      id: { in: dedupedUserIds },
      companyId: input.companyId,
      isActive: true,
    },
    select: { id: true },
  })
  const activeUserIds = activeUsers.map((user) => user.id)
  if (activeUserIds.length === 0) return []

  const preferences = await db.userNotificationPreference.findMany({
    where: { userId: { in: activeUserIds } },
  })
  const preferenceByUserId = new Map(preferences.map((pref) => [pref.userId, pref]))

  return activeUserIds.filter((userId) => {
    const preference = preferenceByUserId.get(userId)
    return input.category === "HR"
      ? isHrEnabledForPreference(preference)
      : isOpsEnabledForPreference(preference)
  })
}

async function createNotification(
  db: DbClient,
  input: CreateNotificationInput,
) {
  const recipientIds = await filterRecipientsForCategory(db, {
    companyId: input.companyId,
    userIds: input.recipientIds,
    category: input.category,
  })
  if (recipientIds.length === 0) return null

  const notification = await db.notification.create({
    data: {
      companyId: input.companyId,
      type: input.type,
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      payloadJson: input.payload ? JSON.stringify(input.payload) : undefined,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceAction: input.sourceAction,
      expiresAt: input.expiresAt ?? undefined,
    },
  })

  await db.notificationRecipient.createMany({
    data: recipientIds.map((userId) => ({
      notificationId: notification.id,
      userId,
    })),
    skipDuplicates: true,
  })

  return notification
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
      viewPath: `/human-resources/payroll?runId=${run.id}`,
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
      viewPath: `/human-resources/disbursements?batchId=${batch.id}`,
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
        ? `/human-resources/disbursements?adjustmentId=${adjustment.id}`
        : `/human-resources/payroll?adjustmentId=${adjustment.id}`
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
      viewPath: `/human-resources/compensation?profileId=${profile.id}`,
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
      viewPath: `/human-resources/payouts?allocationId=${allocation.id}`,
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
      viewPath: `/human-resources/incidents?disciplinaryId=${action.id}`,
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
    viewPath: `/human-resources/compensation?ruleId=${rule.id}`,
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
        title: "Gold payout allocation pending approval",
        summary: `${input.actorName} submitted ${input.label}.`,
      }
    case NotificationType.HR_GOLD_PAYOUT_APPROVED:
      return {
        title: "Gold payout allocation approved",
        summary: `${input.actorName} approved ${input.label}.`,
      }
    case NotificationType.HR_GOLD_PAYOUT_REJECTED:
      return {
        title: "Gold payout allocation rejected",
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
        viewPath: `/human-resources/incidents?incidentId=${input.incident.id}`,
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
        viewPath: `/compliance?tab=incidents&createdId=${input.incident.id}`,
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
        viewPath: `/compliance?tab=permits&createdId=${input.permit.id}`,
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

function payloadViewPath(payload: Record<string, unknown> | null) {
  const viewPath = payload?.viewPath
  return typeof viewPath === "string" ? viewPath : undefined
}

function defaultViewPath(entityType?: NotificationEntityType | null, entityId?: string | null) {
  if (!entityType || !entityId) return undefined
  if (entityType === "PAYROLL_RUN") return `/human-resources/payroll?runId=${entityId}`
  if (entityType === "DISBURSEMENT_BATCH") return `/human-resources/disbursements?batchId=${entityId}`
  if (entityType === "ADJUSTMENT_ENTRY") return `/human-resources/payroll?adjustmentId=${entityId}`
  if (entityType === "COMPENSATION_PROFILE") return `/human-resources/compensation?profileId=${entityId}`
  if (entityType === "COMPENSATION_RULE") return `/human-resources/compensation?ruleId=${entityId}`
  if (entityType === "GOLD_SHIFT_ALLOCATION") return `/human-resources/payouts?allocationId=${entityId}`
  if (entityType === "DISCIPLINARY_ACTION") return `/human-resources/incidents?disciplinaryId=${entityId}`
  if (entityType === "HR_INCIDENT") return `/human-resources/incidents?incidentId=${entityId}`
  if (entityType === "INCIDENT") return `/compliance?tab=incidents&createdId=${entityId}`
  if (entityType === "PERMIT") return `/compliance?tab=permits&createdId=${entityId}`
  if (entityType === "WORK_ORDER") return `/maintenance/work-orders?workOrderId=${entityId}`
  return undefined
}

function approvalApiActions(type: NotificationType, entityId: string) {
  if (type === NotificationType.HR_PAYROLL_SUBMITTED) {
    return [
      {
        key: "approve_payroll_run",
        label: "Approve",
        kind: "api" as const,
        href: `/api/payroll/runs/${entityId}/approve`,
        method: "POST" as const,
        variant: "default" as const,
      },
      {
        key: "reject_payroll_run",
        label: "Reject",
        kind: "api" as const,
        href: `/api/payroll/runs/${entityId}/reject`,
        method: "POST" as const,
        variant: "destructive" as const,
        confirmMessage: "Reject this payroll run?",
      },
    ]
  }

  if (type === NotificationType.HR_DISBURSEMENT_SUBMITTED) {
    return [
      {
        key: "approve_disbursement_batch",
        label: "Approve",
        kind: "api" as const,
        href: `/api/disbursements/batches/${entityId}/approve`,
        method: "POST" as const,
        variant: "default" as const,
      },
    ]
  }

  if (type === NotificationType.HR_ADJUSTMENT_SUBMITTED) {
    return [
      {
        key: "approve_adjustment",
        label: "Approve",
        kind: "api" as const,
        href: `/api/adjustments/${entityId}/approve`,
        method: "POST" as const,
        variant: "default" as const,
      },
      {
        key: "reject_adjustment",
        label: "Reject",
        kind: "api" as const,
        href: `/api/adjustments/${entityId}/reject`,
        method: "POST" as const,
        variant: "destructive" as const,
        confirmMessage: "Reject this adjustment?",
      },
    ]
  }

  if (type === NotificationType.HR_COMP_PROFILE_SUBMITTED) {
    return [
      {
        key: "approve_comp_profile",
        label: "Approve",
        kind: "api" as const,
        href: `/api/compensation/profiles/${entityId}/approve`,
        method: "POST" as const,
        variant: "default" as const,
      },
      {
        key: "reject_comp_profile",
        label: "Reject",
        kind: "api" as const,
        href: `/api/compensation/profiles/${entityId}/reject`,
        method: "POST" as const,
        variant: "destructive" as const,
        confirmMessage: "Reject this compensation profile?",
      },
    ]
  }

  if (type === NotificationType.HR_COMP_RULE_SUBMITTED) {
    return [
      {
        key: "approve_comp_rule",
        label: "Approve",
        kind: "api" as const,
        href: `/api/compensation/rules/${entityId}/approve`,
        method: "POST" as const,
        variant: "default" as const,
      },
      {
        key: "reject_comp_rule",
        label: "Reject",
        kind: "api" as const,
        href: `/api/compensation/rules/${entityId}/reject`,
        method: "POST" as const,
        variant: "destructive" as const,
        confirmMessage: "Reject this compensation rule?",
      },
    ]
  }

  if (type === NotificationType.HR_GOLD_PAYOUT_SUBMITTED) {
    return [
      {
        key: "approve_gold_payout_allocation",
        label: "Approve",
        kind: "api" as const,
        href: `/api/gold/shift-allocations/${entityId}/approve`,
        method: "POST" as const,
        variant: "default" as const,
      },
      {
        key: "reject_gold_payout_allocation",
        label: "Reject",
        kind: "api" as const,
        href: `/api/gold/shift-allocations/${entityId}/reject`,
        method: "POST" as const,
        variant: "destructive" as const,
        confirmMessage:
          "Reject this gold payout allocation? You can add a note from the allocation screen.",
      },
    ]
  }

  if (type === NotificationType.HR_DISCIPLINARY_SUBMITTED) {
    return [
      {
        key: "approve_disciplinary_action",
        label: "Approve",
        kind: "api" as const,
        href: `/api/hr/disciplinary-actions/${entityId}/approve`,
        method: "POST" as const,
        variant: "default" as const,
      },
      {
        key: "reject_disciplinary_action",
        label: "Reject",
        kind: "api" as const,
        href: `/api/hr/disciplinary-actions/${entityId}/reject`,
        method: "POST" as const,
        variant: "destructive" as const,
        confirmMessage: "Reject this disciplinary action?",
      },
    ]
  }

  return []
}

export function parseNotificationPayload(payloadJson: string | null | undefined) {
  if (!payloadJson) return null
  try {
    const parsed = JSON.parse(payloadJson)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

export function buildNotificationActions(input: {
  type: NotificationType
  entityType?: NotificationEntityType | null
  entityId?: string | null
  payload: Record<string, unknown> | null
  userRole?: string
}) {
  const actions: NotificationActionDescriptor[] = []

  const viewPath =
    payloadViewPath(input.payload) ?? defaultViewPath(input.entityType, input.entityId)
  if (viewPath) {
    actions.push({
      key: "view_details",
      label: "View details",
      kind: "link",
      href: viewPath,
      variant: "outline",
    })
  }

  if (!input.entityId || !isApproverRole(input.userRole)) {
    return actions
  }

  return [...approvalApiActions(input.type, input.entityId), ...actions]
}
