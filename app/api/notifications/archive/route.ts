import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

const archiveSchema = z.object({
  recipientIds: z.array(z.string().uuid()).min(1).max(200),
})

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = archiveSchema.parse(body)
    const now = new Date()

    const result = await prisma.notificationRecipient.updateMany({
      where: {
        id: { in: validated.recipientIds },
        userId: session.user.id,
      },
      data: {
        isArchived: true,
        archivedAt: now,
        isRead: true,
        readAt: now,
      },
    })

    return successResponse({ updated: result.count })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/notifications/archive error:", error)
    return errorResponse("Failed to archive notifications")
  }
}
