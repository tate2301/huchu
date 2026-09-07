/**
 * What the gold module tells the managers about: a critical exception, an
 * import that finished with failures, a dispatch the buyer receipted. Approval
 * notices are in `./approval-notifications.ts`.
 */
import { NotificationEntityType, NotificationSeverity, NotificationSourceAction, NotificationType } from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"
import { createNotification, getManagerIds } from "@corelithzw/module-notifications/service"

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
