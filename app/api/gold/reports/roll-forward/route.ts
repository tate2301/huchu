import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { computeRollForward } from "@/lib/gold/reconcile"

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403)
    }

    const companyId = session.user.companyId
    const { searchParams } = new URL(request.url)

    const siteId = searchParams.get("siteId") ?? undefined
    const periodStartRaw = searchParams.get("periodStart")
    const periodEndRaw = searchParams.get("periodEnd")
    const groupByRaw = searchParams.get("groupBy") ?? "site"

    if (!periodStartRaw || !periodEndRaw) {
      return errorResponse("periodStart and periodEnd are required", 400)
    }

    const periodStart = new Date(periodStartRaw)
    const periodEnd = new Date(periodEndRaw)
    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return errorResponse("Invalid date format for periodStart or periodEnd", 400)
    }
    if (periodStart >= periodEnd) {
      return errorResponse("periodStart must be before periodEnd", 400)
    }

    const allowedGroupBy = ["site", "leader", "buyer", "employee"] as const
    type GroupBy = (typeof allowedGroupBy)[number]
    if (!allowedGroupBy.includes(groupByRaw as GroupBy)) {
      return errorResponse(`groupBy must be one of: ${allowedGroupBy.join(", ")}`, 400)
    }

    const rows = await computeRollForward(prisma, {
      companyId,
      siteId,
      periodStart,
      periodEnd,
      groupBy: groupByRaw as GroupBy,
    })
    return successResponse(rows)
  } catch (error) {
    console.error("[API] GET /api/gold/reports/roll-forward error:", error)
    return errorResponse("Failed to compute roll-forward report")
  }
}
