import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(2048),
  auth: z.string().min(1).max(2048),
})

const removeSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
})

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = subscriptionSchema.parse(body)

    const subscription = await prisma.webPushSubscription.upsert({
      where: { endpoint: validated.endpoint },
      update: {
        userId: session.user.id,
        p256dh: validated.p256dh,
        auth: validated.auth,
        isActive: true,
      },
      create: {
        userId: session.user.id,
        endpoint: validated.endpoint,
        p256dh: validated.p256dh,
        auth: validated.auth,
      },
    })

    await prisma.userNotificationPreference.upsert({
      where: { userId: session.user.id },
      update: { webPushEnabled: true },
      create: {
        userId: session.user.id,
        webPushEnabled: true,
      },
    })

    return successResponse(subscription, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/notifications/push-subscriptions error:", error)
    return errorResponse("Failed to save web push subscription")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = removeSubscriptionSchema.parse(body)

    const result = await prisma.webPushSubscription.updateMany({
      where: {
        endpoint: validated.endpoint,
        userId: session.user.id,
      },
      data: {
        isActive: false,
      },
    })

    return successResponse({ updated: result.count })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] DELETE /api/notifications/push-subscriptions error:", error)
    return errorResponse("Failed to remove web push subscription")
  }
}
