/**
 * What the maintenance module tells people about: a work order opened, and
 * one started.
 */
import { NotificationEntityType, NotificationSeverity, NotificationSourceAction, NotificationType } from "@corelithzw/db"
import { createNotification, type DbClient } from "@corelithzw/module-notifications/service"
import { escalationRecipientIds } from "@corelithzw/module-notifications/escalation"

function normalizeWorkOrderSeverity(status: string) {
  return status === "OPEN" ? NotificationSeverity.WARNING : NotificationSeverity.INFO
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
    const recipientIds = await escalationRecipientIds(db, {
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
