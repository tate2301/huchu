import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  hasRole,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const bulkEditSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(500),
  patch: z
    .object({
      mappedShiftGroupId: z.string().uuid().nullable().optional(),
      parsedName: z.string().trim().max(200).nullable().optional(),
      parsedDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      gramsTotal: z.number().min(0).nullable().optional(),
      boysGrams: z.number().min(0).nullable().optional(),
      mdaraGrams: z.number().min(0).nullable().optional(),
      balGrams: z.number().nullable().optional(),
      expensesJson: z.string().nullable().optional(),
    })
    .strict(),
})

/**
 * POST /api/gold/imports/[id]/entries/bulk-edit
 *
 * Apply a partial patch to N entries in a single transaction.
 * Only sets fields that are explicitly present in the patch.
 * Rejects if any entry has status CREATED (use rollback to modify committed work).
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
      return errorResponse("Insufficient permissions to bulk-edit import entries", 403)
    }

    const companyId = session.user.companyId
    const { id } = await params

    const body = await request.json()
    const validated = bulkEditSchema.parse(body)

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    })
    if (!importRecord || importRecord.companyId !== companyId) {
      return errorResponse("Import not found", 404)
    }
    if (importRecord.status === "COMMITTED") {
      return errorResponse(
        "Import is committed. Roll back the import to edit entries.",
        409,
      )
    }

    // Verify all entryIds belong to this import and none are CREATED.
    const entries = await prisma.goldLedgerEntry.findMany({
      where: { id: { in: validated.entryIds }, importId: id },
      select: { id: true, status: true },
    })

    if (entries.length !== validated.entryIds.length) {
      return errorResponse(
        "One or more entryIds do not belong to this import",
        400,
      )
    }

    const createdEntry = entries.find((e) => e.status === "CREATED")
    if (createdEntry) {
      return errorResponse(
        "One or more entries are already committed (CREATED). Roll back the import to edit them.",
        409,
      )
    }

    // Build the update data object from only the fields present in patch.
    const data: Record<string, unknown> = {}
    const { patch } = validated

    if ("mappedShiftGroupId" in patch) data.mappedShiftGroupId = patch.mappedShiftGroupId
    if ("parsedName" in patch) data.parsedName = patch.parsedName ?? null
    if ("parsedDate" in patch) {
      data.parsedDate = patch.parsedDate ? new Date(patch.parsedDate) : null
    }
    if ("gramsTotal" in patch) data.gramsTotal = patch.gramsTotal
    if ("boysGrams" in patch) data.boysGrams = patch.boysGrams
    if ("mdaraGrams" in patch) data.mdaraGrams = patch.mdaraGrams
    if ("balGrams" in patch) data.balGrams = patch.balGrams
    if ("expensesJson" in patch) data.expensesJson = patch.expensesJson

    if (Object.keys(data).length === 0) {
      return errorResponse("patch must contain at least one field", 400)
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.goldLedgerEntry.updateMany({
        where: { id: { in: validated.entryIds }, importId: id },
        data,
      })
      return updated.count
    })

    return successResponse({ updated: result, anomaliesRevalidated: false })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/imports/[id]/entries/bulk-edit error:", error)
    return errorResponse("Failed to bulk-edit entries")
  }
}
