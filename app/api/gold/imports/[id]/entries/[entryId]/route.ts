import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const expenseRow = z.object({
  type: z.string().trim().min(1).max(50),
  weight: z.number().min(0),
})

const updateEntrySchema = z
  .object({
    parsedDate: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
      .nullable()
      .optional(),
    parsedName: z.string().trim().max(200).nullable().optional(),
    gramsTotal: z.number().min(0).nullable().optional(),
    expenses: z.array(expenseRow).optional(),
    boysGrams: z.number().min(0).nullable().optional(),
    mdaraGrams: z.number().min(0).nullable().optional(),
    balGrams: z.number().nullable().optional(),
  })
  .strict()

/**
 * Update an in-progress GoldLedgerEntry before commit. Used by the
 * import wizard's editable preview table.
 *
 * Refuses to mutate entries that already produced records (CREATED with
 * an allocation/pour FK) — operators must reset/recommit if they want
 * to change those.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const companyId = session.user.companyId
    const { id, entryId } = await params

    const body = await request.json()
    const validated = updateEntrySchema.parse(body)

    const entry = await prisma.goldLedgerEntry.findUnique({
      where: { id: entryId },
      include: {
        import: { select: { id: true, companyId: true, status: true } },
      },
    })
    if (!entry || entry.importId !== id) {
      return errorResponse("Entry not found", 404)
    }
    if (entry.import.companyId !== companyId) {
      return errorResponse("Forbidden", 403)
    }
    if (entry.goldShiftAllocationId || entry.goldPourId || entry.buyerReceiptId) {
      return errorResponse(
        "Entry has already produced records. Reset the import (recommit) to edit.",
        409,
      )
    }

    const data: Record<string, unknown> = {}

    if ("parsedDate" in validated) {
      data.parsedDate = validated.parsedDate
        ? new Date(validated.parsedDate)
        : null
    }
    if ("parsedName" in validated) {
      data.parsedName = validated.parsedName?.trim() || null
    }
    if ("gramsTotal" in validated) {
      data.gramsTotal = validated.gramsTotal
    }
    if ("expenses" in validated && validated.expenses !== undefined) {
      data.expensesJson = JSON.stringify(validated.expenses)
    }
    if ("boysGrams" in validated) data.boysGrams = validated.boysGrams
    if ("mdaraGrams" in validated) data.mdaraGrams = validated.mdaraGrams
    if ("balGrams" in validated) data.balGrams = validated.balGrams

    // If the user touched a numeric field, the original parser warning
    // (e.g. "Tot Exp mismatch") may no longer apply. We DON'T touch
    // parserWarning automatically — let the operator either clear it
    // explicitly or accept that the warning rides through. errorMessage
    // (post-commit context) is cleared on edit since the row will be
    // re-evaluated.
    data.errorMessage = null
    if (entry.status === "FAILED" || entry.status === "ANOMALY") {
      // Reset to PENDING so the next commit treats it fresh; parserWarning
      // (if set) will still surface the original parse-time concern.
      data.status = entry.parserWarning ? "ANOMALY" : "PENDING"
    }

    const updated = await prisma.goldLedgerEntry.update({
      where: { id: entryId },
      data,
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/gold/imports/[id]/entries/[entryId] error:", error)
    return errorResponse("Failed to update entry")
  }
}
