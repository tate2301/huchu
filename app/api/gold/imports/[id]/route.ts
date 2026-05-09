import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  siteId: z.string().uuid().optional(),
  mappings: z.record(z.string(), z.string().uuid()).optional(),
  notes: z.string().max(500).optional(),
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

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, code: true } },
        entries: {
          orderBy: { lineNo: "asc" },
          include: {
            shiftGroup: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!importRecord || importRecord.companyId !== session.user.companyId) {
      return errorResponse("Import not found", 404)
    }

    return successResponse(importRecord)
  } catch (error) {
    console.error("[API] GET /api/gold/imports/[id] error:", error)
    return errorResponse("Failed to fetch import")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const body = await request.json()
    const validated = patchSchema.parse(body)

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { companyId: true, status: true, mappingsJson: true },
    })
    if (!importRecord || importRecord.companyId !== session.user.companyId) {
      return errorResponse("Import not found", 404)
    }
    if (importRecord.status === "COMMITTED") {
      return errorResponse("Cannot edit a committed import", 409)
    }

    let mergedMappings = importRecord.mappingsJson
      ? (JSON.parse(importRecord.mappingsJson) as Record<string, string>)
      : {}
    if (validated.mappings) {
      mergedMappings = { ...mergedMappings, ...validated.mappings }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.goldLedgerImport.update({
        where: { id },
        data: {
          siteId: validated.siteId ?? undefined,
          mappingsJson: validated.mappings ? JSON.stringify(mergedMappings) : undefined,
          notes: validated.notes ?? undefined,
        },
      })

      // Apply name mappings to PENDING entries.
      if (validated.mappings) {
        for (const [name, shiftGroupId] of Object.entries(validated.mappings)) {
          await tx.goldLedgerEntry.updateMany({
            where: { importId: id, parsedName: name, status: { in: ["PENDING", "ANOMALY"] } },
            data: { mappedShiftGroupId: shiftGroupId },
          })
        }
      }

      return record
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/gold/imports/[id] error:", error)
    return errorResponse("Failed to update import")
  }
}

/**
 * Delete an import. Allowed only when nothing's been produced yet —
 * uncommitted imports (DRAFT / MAPPING / PREVIEW / ROLLED_BACK). For
 * COMMITTED or FAILED imports, use the rollback endpoint first to
 * remove artifacts, then delete.
 *
 * Cascade on the schema removes child entries.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    })
    if (!importRecord || importRecord.companyId !== session.user.companyId) {
      return errorResponse("Import not found", 404)
    }

    if (
      importRecord.status === "COMMITTED" ||
      importRecord.status === "FAILED"
    ) {
      return errorResponse(
        "Roll back the import first — it still has produced records.",
        409,
      )
    }

    // GoldLedgerEntry has Cascade onDelete from the schema, so deleting
    // the parent removes all entries.
    await prisma.goldLedgerImport.delete({ where: { id } })

    return successResponse({ deleted: true, id })
  } catch (error) {
    console.error("[API] DELETE /api/gold/imports/[id] error:", error)
    return errorResponse("Failed to delete import")
  }
}
