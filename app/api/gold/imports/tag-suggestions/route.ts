import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403)
    }

    const distinct = await prisma.goldLedgerImportTag.findMany({
      where: { import: { companyId: session.user.companyId } },
      distinct: ["label"],
      orderBy: { label: "asc" },
      take: 200,
    })

    return successResponse(distinct.map((t) => t.label))
  } catch (error) {
    console.error("[API] GET /api/gold/imports/tag-suggestions error:", error)
    return errorResponse("Failed to get tag suggestions")
  }
}
