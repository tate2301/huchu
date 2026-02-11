import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

const updatePreferenceSchema = z
  .object({
    inAppEnabled: z.boolean().optional(),
    webPushEnabled: z.boolean().optional(),
    hrEnabled: z.boolean().optional(),
    opsEnabled: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one preference field is required",
  })

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const preference = await prisma.userNotificationPreference.findUnique({
      where: { userId: session.user.id },
    })

    return successResponse(
      preference ?? {
        userId: session.user.id,
        inAppEnabled: true,
        webPushEnabled: false,
        hrEnabled: true,
        opsEnabled: true,
      },
    )
  } catch (error) {
    console.error("[API] GET /api/notifications/preferences error:", error)
    return errorResponse("Failed to fetch notification preferences")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = updatePreferenceSchema.parse(body)

    const preference = await prisma.userNotificationPreference.upsert({
      where: { userId: session.user.id },
      update: validated,
      create: {
        userId: session.user.id,
        ...validated,
      },
    })

    return successResponse(preference)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PUT /api/notifications/preferences error:", error)
    return errorResponse("Failed to update notification preferences")
  }
}
