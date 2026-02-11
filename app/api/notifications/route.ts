import { NextRequest, NextResponse } from "next/server"
import { Prisma, NotificationSeverity, NotificationType } from "@prisma/client"

import {
  errorResponse,
  getPaginationParams,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import {
  buildNotificationActions,
  parseNotificationPayload,
} from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

function isNotificationType(value: string | null): value is NotificationType {
  return Boolean(value && Object.values(NotificationType).includes(value as NotificationType))
}

function isNotificationSeverity(value: string | null): value is NotificationSeverity {
  return Boolean(
    value && Object.values(NotificationSeverity).includes(value as NotificationSeverity),
  )
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)

    const unreadOnly = searchParams.get("unreadOnly") === "true"
    const includeArchived = searchParams.get("includeArchived") === "true"
    const type = searchParams.get("type")
    const severity = searchParams.get("severity")

    const baseWhere: Prisma.NotificationRecipientWhereInput = {
      userId: session.user.id,
      ...(includeArchived ? {} : { isArchived: false }),
    }

    const where: Prisma.NotificationRecipientWhereInput = {
      ...baseWhere,
      ...(unreadOnly ? { isRead: false } : {}),
    }

    const notificationWhere: Prisma.NotificationWhereInput = {}
    if (isNotificationType(type)) {
      notificationWhere.type = type
    }
    if (isNotificationSeverity(severity)) {
      notificationWhere.severity = severity
    }
    if (Object.keys(notificationWhere).length > 0) {
      where.notification = notificationWhere
    }

    const [records, total, unreadCount] = await Promise.all([
      prisma.notificationRecipient.findMany({
        where,
        include: {
          notification: true,
        },
        orderBy: [{ notification: { createdAt: "desc" } }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.notificationRecipient.count({ where }),
      prisma.notificationRecipient.count({
        where: {
          userId: session.user.id,
          isArchived: false,
          isRead: false,
        },
      }),
    ])

    const data = records.map((record) => {
      const payload = parseNotificationPayload(record.notification.payloadJson)
      const actions = buildNotificationActions({
        type: record.notification.type,
        entityType: record.notification.entityType,
        entityId: record.notification.entityId,
        payload,
        userRole: session.user.role,
      })

      return {
        id: record.notification.id,
        recipientId: record.id,
        type: record.notification.type,
        severity: record.notification.severity,
        title: record.notification.title,
        summary: record.notification.summary,
        payload,
        entityType: record.notification.entityType,
        entityId: record.notification.entityId,
        sourceAction: record.notification.sourceAction,
        createdAt: record.notification.createdAt.toISOString(),
        isRead: record.isRead,
        readAt: record.readAt?.toISOString() ?? null,
        isArchived: record.isArchived,
        archivedAt: record.archivedAt?.toISOString() ?? null,
        actionTaken: record.actionTaken ?? null,
        actedAt: record.actedAt?.toISOString() ?? null,
        actions,
      }
    })

    return successResponse({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
        hasMore: page * limit < total,
      },
      unreadCount,
    })
  } catch (error) {
    console.error("[API] GET /api/notifications error:", error)
    return errorResponse("Failed to fetch notifications")
  }
}
