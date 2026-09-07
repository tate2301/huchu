/**
 * Notifications: who is told what, and what they can do about it.
 *
 * The service is generic — it writes a notice, fans it out to the recipients
 * whose preferences allow it, and turns a stored notice into the actions the
 * centre renders. It names no module. What a notice about a payroll run opens,
 * and what an approver may do from it, is data the owning module's manifest
 * carries (`notifications.viewPaths`, `notifications.approvalActions`); the
 * emitters that know those entities live with their modules.
 */
import {
  type NotificationEntityType,
  type NotificationSeverity,
  type NotificationSourceAction,
  type NotificationType,
  Prisma,
  PrismaClient,
  type UserNotificationPreference,
} from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"
import { registeredModules, type NotificationActionTemplate } from "@corelithzw/platform/manifest"

export type DbClient = Prisma.TransactionClient | PrismaClient

export type NotificationCategory = "HR" | "OPS" | "CRM"

export type NotificationActionDescriptor = {
  key: string
  label: string
  kind: "api" | "link"
  href: string
  method?: "POST" | "PATCH" | "DELETE"
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost"
  confirmMessage?: string
}

export type CreateNotificationInput = {
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

export function isApproverRole(role: string | undefined) {
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

function isCrmEnabledForPreference(pref: UserNotificationPreference | undefined) {
  if (!pref) return true
  return pref.inAppEnabled && pref.crmEnabled
}

export async function filterRecipientsForCategory(
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
    // Each category reads its own switch. CRM notices previously followed the
    // ops switch, so turning ops off silently killed them too.
    if (input.category === "HR") return isHrEnabledForPreference(preference)
    if (input.category === "CRM") return isCrmEnabledForPreference(preference)
    return isOpsEnabledForPreference(preference)
  })
}

export async function createNotification(
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

function payloadViewPath(payload: Record<string, unknown> | null) {
  const viewPath = payload?.viewPath
  return typeof viewPath === "string" ? viewPath : undefined
}

function fillTemplate(template: string, entityId: string) {
  return template.replace(/\{id\}/g, encodeURIComponent(entityId))
}

/** Where a notice opens, from the manifest of the module that owns the entity. */
function defaultViewPath(entityType?: NotificationEntityType | null, entityId?: string | null) {
  if (!entityType || !entityId) return undefined
  for (const manifest of registeredModules()) {
    const template = manifest.notifications?.viewPaths?.[entityType]
    if (template) return fillTemplate(template, entityId)
  }
  return undefined
}

/** What an approver can do from the notice, from the owning module's manifest. */
function approvalApiActions(type: NotificationType, entityId: string): NotificationActionDescriptor[] {
  for (const manifest of registeredModules()) {
    const templates = manifest.notifications?.approvalActions?.[type]
    if (templates) {
      return templates.map((template: NotificationActionTemplate) => ({
        ...template,
        href: fillTemplate(template.href, entityId),
      }))
    }
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

/** The managers of a company, who approve things; the usual recipients of a notice. */
export async function getManagerIds(companyId: string, excludeId?: string): Promise<string[]> {
  const managers = await prisma.user.findMany({
    where: {
      companyId,
      role: { in: ["MANAGER", "SUPERADMIN"] },
      isActive: true,
    },
    select: { id: true },
  })
  return managers.map((u) => u.id).filter((id) => id !== excludeId)
}
