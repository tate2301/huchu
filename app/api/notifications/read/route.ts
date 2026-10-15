import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

/** Some of the reader's notifications by id, or `all: true` for every unread one of theirs. */
const readSchema = z.union([
  z.object({
    recipientIds: z.array(z.string().uuid()).min(1).max(200),
    actionTaken: z.string().max(100).optional(),
  }),
  z.object({ all: z.literal(true) }),
])

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = readSchema.parse(body)
    const now = new Date()

    if ("all" in validated) {
      const result = await prisma.notificationRecipient.updateMany({
        where: { userId: session.user.id, isRead: false, isArchived: false },
        data: { isRead: true, readAt: now },
      })
      return successResponse({ updated: result.count })
    }

    const result = await prisma.notificationRecipient.updateMany({
      where: {
        id: { in: validated.recipientIds },
        userId: session.user.id,
      },
      data: {
        isRead: true,
        readAt: now,
        actionTaken: validated.actionTaken ?? undefined,
        actedAt: validated.actionTaken ? now : undefined,
      },
    })

    return successResponse({ updated: result.count })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/notifications/read error:", error)
    return errorResponse("Failed to mark notifications as read")
  }
}
