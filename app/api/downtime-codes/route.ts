import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const active = searchParams.get("active")

    const isActive =
      active === null ? true : active === "true"

    if (siteId) {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { companyId: true },
      })

      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }
    }

    const where: Record<string, unknown> = {
      isActive,
      OR: siteId
        ? [{ siteId }, { siteId: null }]
        : [{ siteId: null }, { site: { companyId: session.user.companyId } }],
    }

    const codes = await prisma.downtimeCode.findMany({
      where,
      select: {
        id: true,
        code: true,
        description: true,
        siteId: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    })

    return successResponse({ codes })
  } catch (error) {
    console.error("[API] GET /api/downtime-codes error:", error)
    return errorResponse("Failed to fetch downtime codes")
  }
}
