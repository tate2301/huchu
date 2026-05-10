import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403)
    }

    const imp = await prisma.goldLedgerImport.findUnique({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    })
    if (!imp) return errorResponse("Import not found", 404)

    const events = await prisma.platformAuditEvent.findMany({
      where: {
        companyId: session.user.companyId,
        entityType: "GoldLedgerImport",
        entityId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    return successResponse(events)
  } catch (error) {
    console.error("[API] GET /api/gold/imports/[id]/activity error:", error)
    return errorResponse("Failed to list activity")
  }
}
