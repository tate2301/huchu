import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  hasRole,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const insertEntrySchema = z.object({
  afterEntryId: z.string().uuid().nullable().optional(),
  beforeEntryId: z.string().uuid().nullable().optional(),
  parsedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  parsedName: z.string().trim().max(200).nullable().optional(),
  mappedShiftGroupId: z.string().uuid().nullable().optional(),
  gramsTotal: z.number().min(0).nullable().optional(),
  boysGrams: z.number().min(0).nullable().optional(),
  mdaraGrams: z.number().min(0).nullable().optional(),
  balGrams: z.number().nullable().optional(),
  expensesJson: z.string().nullable().optional(),
})

/**
 * POST /api/gold/imports/[id]/entries
 *
 * Insert a new operator-added row into the import. Accepts an anchor via
 * afterEntryId or beforeEntryId; omitting both inserts at the end.
 *
 * Subsequent rows are shifted by +1 to make room for the new row.
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
      return errorResponse("Insufficient permissions to insert import entries", 403)
    }

    const companyId = session.user.companyId
    const { id } = await params

    const body = await request.json()
    const validated = insertEntrySchema.parse(body)

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: {
        companyId: true,
        status: true,
        tombstonedAt: true,
        archivedAt: true,
      },
    })
    if (!importRecord || importRecord.companyId !== companyId) {
      return errorResponse("Import not found", 404)
    }
    if (importRecord.tombstonedAt || importRecord.archivedAt) {
      return errorResponse("Cannot modify a tombstoned or archived import", 409)
    }
    if (importRecord.status === "COMMITTED") {
      return errorResponse(
        "Import is committed. Roll back the import to add entries.",
        409,
      )
    }

    const newEntry = await prisma.$transaction(async (tx) => {
      // Determine the lineNo for the new row.
      let insertAfterLineNo: number

      if (validated.afterEntryId) {
        const anchor = await tx.goldLedgerEntry.findUnique({
          where: { id: validated.afterEntryId },
          select: { lineNo: true, importId: true },
        })
        if (!anchor || anchor.importId !== id) {
          throw new Error("afterEntryId not found in this import")
        }
        insertAfterLineNo = anchor.lineNo
      } else if (validated.beforeEntryId) {
        const anchor = await tx.goldLedgerEntry.findUnique({
          where: { id: validated.beforeEntryId },
          select: { lineNo: true, importId: true },
        })
        if (!anchor || anchor.importId !== id) {
          throw new Error("beforeEntryId not found in this import")
        }
        // Insert before means insert after the row preceding the anchor,
        // which is anchor.lineNo - 1 (may not exist). We shift from anchor
        // onward and use anchor.lineNo for the new row.
        insertAfterLineNo = anchor.lineNo - 1
      } else {
        // Insert at end: MAX(lineNo) or 0 if empty.
        const agg = await tx.goldLedgerEntry.aggregate({
          where: { importId: id },
          _max: { lineNo: true },
        })
        const maxLine = agg._max.lineNo ?? 0
        // No shifting needed — just append.
        return tx.goldLedgerEntry.create({
          data: {
            importId: id,
            companyId,
            lineNo: maxLine + 1,
            rawJson: "{}",
            status: "PENDING",
            parsedDate: validated.parsedDate ? new Date(validated.parsedDate) : null,
            parsedName: validated.parsedName ?? null,
            mappedShiftGroupId: validated.mappedShiftGroupId ?? null,
            gramsTotal: validated.gramsTotal ?? null,
            boysGrams: validated.boysGrams ?? null,
            mdaraGrams: validated.mdaraGrams ?? null,
            balGrams: validated.balGrams ?? null,
            expensesJson: validated.expensesJson ?? null,
          },
        })
      }

      const newLineNo = insertAfterLineNo + 1

      // Two-pass shift avoids transient unique(importId, lineNo) conflicts.
      // Pass 1: move affected rows into negative space (safe because lineNo > 0 in production).
      // Pass 2: set them to final target values.
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

      return tx.goldLedgerEntry.create({
        data: {
          importId: id,
          companyId,
          lineNo: newLineNo,
          rawJson: "{}",
          status: "PENDING",
          parsedDate: validated.parsedDate ? new Date(validated.parsedDate) : null,
          parsedName: validated.parsedName ?? null,
          mappedShiftGroupId: validated.mappedShiftGroupId ?? null,
          gramsTotal: validated.gramsTotal ?? null,
          boysGrams: validated.boysGrams ?? null,
          mdaraGrams: validated.mdaraGrams ?? null,
          balGrams: validated.balGrams ?? null,
          expensesJson: validated.expensesJson ?? null,
        },
      })
    })

    return successResponse(newEntry, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    const msg = error instanceof Error ? error.message : ""
    if (msg.includes("not found in this import")) {
      return errorResponse(msg, 404)
    }
    console.error("[API] POST /api/gold/imports/[id]/entries error:", error)
    return errorResponse("Failed to insert entry")
  }
}
