import { NextRequest, NextResponse } from "next/server"
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)

    const entityType = searchParams.get("entityType")
    const entityId = searchParams.get("entityId")
    const actedById = searchParams.get("actedById")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }
    if (entityType) where.entityType = entityType
    if (entityId) where.entityId = entityId
    if (actedById) where.actedById = actedById
    if (startDate || endDate) {
      where.actedAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      }
    }

    const [records, total] = await Promise.all([
      prisma.approvalAction.findMany({
        where,
        include: {
          actedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { actedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.approvalAction.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/approvals/history error:", error)
    return errorResponse("Failed to fetch approval history")
  }
}
