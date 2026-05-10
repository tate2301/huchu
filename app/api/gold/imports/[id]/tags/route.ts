import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const setTagsSchema = z.object({
  labels: z.array(z.string().min(1).max(80)).max(20),
})

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

    const tags = await prisma.goldLedgerImportTag.findMany({
      where: { importId: id },
      orderBy: { label: "asc" },
    })

    return successResponse(tags)
  } catch (error) {
    console.error("[API] GET /api/gold/imports/[id]/tags error:", error)
    return errorResponse("Failed to list tags")
  }
}

export async function POST(
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

    const body = await request.json()
    const parsed = setTagsSchema.safeParse(body)
    if (!parsed.success) return errorResponse(parsed.error.message, 400)

    const labels = parsed.data.labels.map((l) => l.trim()).filter(Boolean)

    await prisma.$transaction(async (tx) => {
      await tx.goldLedgerImportTag.deleteMany({ where: { importId: id } })
      if (labels.length > 0) {
        await tx.goldLedgerImportTag.createMany({
          data: labels.map((label) => ({ importId: id, label })),
          skipDuplicates: true,
        })
      }
    })

    const tags = await prisma.goldLedgerImportTag.findMany({
      where: { importId: id },
      orderBy: { label: "asc" },
    })

    return successResponse(tags)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/tags error:", error)
    return errorResponse("Failed to set tags")
  }
}

