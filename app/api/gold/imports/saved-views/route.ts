import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const saveViewSchema = z.object({
  name: z.string().min(1).max(120),
  filterJson: z.string().max(8000),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403)
    }

    const views = await prisma.goldImportSavedView.findMany({
      where: { companyId: session.user.companyId, userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    })

    return successResponse(views)
  } catch (error) {
    console.error("[API] GET /api/gold/imports/saved-views error:", error)
    return errorResponse("Failed to list saved views")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403)
    }

    const body = await request.json()
    const parsed = saveViewSchema.safeParse(body)
    if (!parsed.success) return errorResponse(parsed.error.message, 400)

    const view = await prisma.goldImportSavedView.upsert({
      where: {
        companyId_userId_name: {
          companyId: session.user.companyId,
          userId: session.user.id,
          name: parsed.data.name,
        },
      },
      create: {
        companyId: session.user.companyId,
        userId: session.user.id,
        name: parsed.data.name,
        filterJson: parsed.data.filterJson,
      },
      update: {
        filterJson: parsed.data.filterJson,
      },
    })

    return successResponse(view, 201)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/saved-views error:", error)
    return errorResponse("Failed to save view")
  }
}
