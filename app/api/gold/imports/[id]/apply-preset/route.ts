import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const applyPresetSchema = z.object({
  presetId: z.string().uuid(),
})

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
      select: { id: true, status: true },
    })
    if (!imp) return errorResponse("Import not found", 404)
    if (imp.status === "COMMITTED") return errorResponse("Cannot modify a committed import", 409)

    const body = await request.json()
    const parsed = applyPresetSchema.safeParse(body)
    if (!parsed.success) return errorResponse(parsed.error.message, 400)

    const preset = await prisma.goldLedgerImportPreset.findUnique({
      where: { id: parsed.data.presetId, companyId: session.user.companyId },
    })
    if (!preset) return errorResponse("Preset not found", 404)

    const updated = await prisma.goldLedgerImport.update({
      where: { id },
      data: { mappingsJson: preset.mappingJson, presetId: preset.id },
      select: { id: true, mappingsJson: true, presetId: true },
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/apply-preset error:", error)
    return errorResponse("Failed to apply preset")
  }
}
