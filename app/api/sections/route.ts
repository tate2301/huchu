import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const active = searchParams.get("active")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    }

    if (siteId) where.siteId = siteId
    if (active !== null) where.isActive = active === "true"

    const [sections, total] = await Promise.all([
      prisma.section.findMany({
        where,
        select: {
          id: true,
          name: true,
          siteId: true,
          isActive: true,
          site: { select: { name: true, code: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.section.count({ where }),
    ])

    return successResponse(paginationResponse(sections, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/sections error:", error)
    return errorResponse("Failed to fetch sections")
  }
}
