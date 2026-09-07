/** The CRM's notices: who is told when a lead moves, a discount waits, a comment lands. */
import { NotificationEntityType, NotificationSeverity, NotificationSourceAction, NotificationType } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import { createNotification, getManagerIds } from "@corelithzw/module-notifications/service";

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
