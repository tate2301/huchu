import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { findAccountingBacklog } from "@/lib/gold/reconcile"

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

    const asOfRaw = searchParams.get("asOf")
    const asOf = asOfRaw ? new Date(asOfRaw) : undefined
    if (asOf && isNaN(asOf.getTime())) {
      return errorResponse("Invalid date format for asOf", 400)
    }

    const backlog = await findAccountingBacklog(prisma, { companyId, asOf })
    return successResponse(backlog)
  } catch (error) {
    console.error("[API] GET /api/gold/reports/accounting-backlog error:", error)
    return errorResponse("Failed to fetch accounting backlog")
  }
}
