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

    const { searchParams } = new URL(request.url)
    const headerHash = searchParams.get("headerHash") ?? undefined

    const presets = await prisma.goldLedgerImportPreset.findMany({
      where: {
        companyId: session.user.companyId,
        ...(headerHash ? { sampleHeaderHash: headerHash } : {}),
      },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    })

    return successResponse(presets)
  } catch (error) {
    console.error("[API] GET /api/gold/imports/presets error:", error)
    return errorResponse("Failed to list presets")
  }
}
