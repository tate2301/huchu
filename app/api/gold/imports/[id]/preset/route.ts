import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const savePresetSchema = z.object({
  name: z.string().min(1).max(120),
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
      select: { id: true, mappingsJson: true, sampleHeaderHash: true },
    })
    if (!imp) return errorResponse("Import not found", 404)
    if (!imp.mappingsJson) return errorResponse("No mappings to save as preset", 400)

    const body = await request.json()
    const parsed = savePresetSchema.safeParse(body)
    if (!parsed.success) return errorResponse(parsed.error.message, 400)

    const preset = await prisma.goldLedgerImportPreset.upsert({
      where: {
        companyId_name: {
          companyId: session.user.companyId,
          name: parsed.data.name,
        },
      },
      create: {
        companyId: session.user.companyId,
        name: parsed.data.name,
        mappingJson: imp.mappingsJson,
        sampleHeaderHash: imp.sampleHeaderHash ?? null,
        createdById: session.user.id,
      },
      update: {
        mappingJson: imp.mappingsJson,
        sampleHeaderHash: imp.sampleHeaderHash ?? null,
      },
    })

    return successResponse(preset, 201)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/preset error:", error)
    return errorResponse("Failed to save preset")
  }
}
