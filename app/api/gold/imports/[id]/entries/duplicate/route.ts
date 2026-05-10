import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  hasRole,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const duplicateSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(200),
})

/**
 * POST /api/gold/imports/[id]/entries/duplicate
 *
 * Duplicate the selected entries, inserting each copy immediately after its
 * original with the same field values. The copies get status PENDING and a
 * fresh rawJson "{}". Subsequent rows are shifted to accommodate all new rows
 * in one pass before any insert.
 * Role gate: OPERATOR+
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to duplicate import entries", 403)
    }

    const companyId = session.user.companyId
    const { id } = await params

    const body = await request.json()
    const validated = duplicateSchema.parse(body)

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    })
    if (!importRecord || importRecord.companyId !== companyId) {
      return errorResponse("Import not found", 404)
    }
    if (importRecord.status === "COMMITTED") {
      return errorResponse(
        "Import is committed. Roll back the import to duplicate entries.",
        409,
      )
    }

    // Fetch the originals and verify they all belong to this import.
    const originals = await prisma.goldLedgerEntry.findMany({
      where: { id: { in: validated.entryIds }, importId: id },
      orderBy: { lineNo: "asc" },
    })

    if (originals.length !== validated.entryIds.length) {
      return errorResponse(
        "One or more entryIds do not belong to this import",
        400,
      )
    }

    const newEntryIds: string[] = []

    const created = await prisma.$transaction(async (tx) => {
      // We insert one copy per original, each immediately after the original.
      // Process in ascending lineNo order. After inserting after original[i] at
      // lineNo L, all subsequent rows (and later originals) are already shifted,
      // so we track a cumulative offset.
      let offset = 0
      const results = []

      for (const original of originals) {
        const insertAfter = original.lineNo + offset
        const newLineNo = insertAfter + 1

        // Two-pass shift to avoid transient unique(importId, lineNo) conflicts.
        await tx.$executeRaw`
          UPDATE "GoldLedgerEntry"
          SET "lineNo" = -("lineNo" + 1)
          WHERE "importId" = ${id}
            AND "lineNo" >= ${newLineNo}
        `
        await tx.$executeRaw`
          UPDATE "GoldLedgerEntry"
          SET "lineNo" = -"lineNo"
          WHERE "importId" = ${id}
            AND "lineNo" < 0
        `

        const copy = await tx.goldLedgerEntry.create({
          data: {
            importId: id,
            companyId: original.companyId,
            lineNo: newLineNo,
            rawJson: "{}",
            status: "PENDING",
            parsedDate: original.parsedDate,
            parsedName: original.parsedName,
            mappedShiftGroupId: original.mappedShiftGroupId,
            gramsTotal: original.gramsTotal,
            boysGrams: original.boysGrams,
            mdaraGrams: original.mdaraGrams,
            balGrams: original.balGrams,
            expensesJson: original.expensesJson,
          },
        })

        newEntryIds.push(copy.id)
        results.push(copy)
        offset += 1
      }

      return results
    })

    return successResponse({ created: created.length, newEntryIds })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/imports/[id]/entries/duplicate error:", error)
    return errorResponse("Failed to duplicate entries")
  }
}
