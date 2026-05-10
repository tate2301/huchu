import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { findUndispatchedPours } from "@/lib/gold/reconcile"

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
    const asOfRaw = searchParams.get("asOf")
    const asOf = asOfRaw ? new Date(asOfRaw) : undefined
    if (asOf && isNaN(asOf.getTime())) {
      return errorResponse("Invalid date format for asOf", 400)
    }

    const pours = await findUndispatchedPours(prisma, { companyId, siteId, asOf })
    return successResponse(pours)
  } catch (error) {
    console.error("[API] GET /api/gold/reports/undispatched-pours error:", error)
    return errorResponse("Failed to fetch undispatched pours")
  }
}
