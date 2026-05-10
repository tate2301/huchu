import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { writeGoldAuditEvent } from "@/lib/audit/gold"

const overrideSchema = z.object({
  reason: z.string().trim().min(10, "Reason must be at least 10 characters"),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["SUPERADMIN"])) {
      return errorResponse("SUPERADMIN access required to override a period close", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = overrideSchema.parse(body)

    const existing = await prisma.goldPeriodClose.findUnique({
      where: { id },
      select: { id: true, companyId: true, overrideAt: true },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Period close not found", 404)
    }

    if (existing.overrideAt) {
      return errorResponse("Period is already overridden (open)", 409)
    }

    const updated = await prisma.goldPeriodClose.update({
      where: { id },
      data: {
        overrideReason: validated.reason,
        overrideById: session.user.id,
        overrideAt: new Date(),
      },
      include: {
        closedBy: { select: { id: true, name: true, email: true } },
        overrideBy: { select: { id: true, name: true, email: true } },
        site: { select: { id: true, name: true, code: true } },
      },
    })

    await writeGoldAuditEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      eventType: "gold.period.override",
      entityType: "GoldPeriodClose",
      entityId: id,
      payload: { reason: validated.reason },
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/gold/period-close/[id]/override error:", error)
    return errorResponse("Failed to override period close")
  }
}
