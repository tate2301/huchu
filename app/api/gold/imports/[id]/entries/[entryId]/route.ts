import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  hasRole,
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
    /** Whole-array replace (legacy). Prefer expensePatch for partial edits. */
    expenses: z.array(expenseRow).optional(),
    /**
     * Single-type delta. Server merges against the latest DB state, so two
     * concurrent edits on different types can't overwrite each other. weight
     * = null removes the row.
     */
    expensePatch: z
      .object({
        type: z.string().trim().min(1).max(50),
        weight: z.number().min(0).nullable(),
      })
      .optional(),
    boysGrams: z.number().min(0).nullable().optional(),
    mdaraGrams: z.number().min(0).nullable().optional(),
    balGrams: z.number().nullable().optional(),
  })
  .strict()

type Expense = z.infer<typeof expenseRow>

function parseExpenses(raw: string | null): Expense[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as Expense[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/**
 * Update an in-progress GoldLedgerEntry before commit. Used by the
 * import wizard's editable preview table.
 *
 * Refuses to mutate entries when:
 *   - the parent import is already COMMITTED (history is finalised; use
 *     the rollback flow to re-open it), OR
 *   - the entry already produced records (allocation/pour/receipt FK).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to edit import entries", 403)
    }

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
    // Block edits when the parent import is finalised. The entry-level
    // FK guard alone wasn't enough — direct PATCH against an entry whose
    // FKs hadn't been populated yet (e.g. a sales-only row in a COMMITTED
    // import) could still mutate finalised history.
    if (entry.import.status === "COMMITTED") {
      return errorResponse(
        "Import is committed. Roll back the import to edit entries.",
        409,
      )
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
    // Partial expense delta — merge against the latest DB state inside a
    // tx so concurrent edits on different types never overwrite each
    // other (the previous full-array replacement let race conditions
    // silently drop edits when the client recomputed from a stale
    // snapshot).
    if (validated.expensePatch) {
      const { type, weight } = validated.expensePatch
      const lower = type.toLowerCase()
      const current = parseExpenses(entry.expensesJson)
      const without = current.filter(
        (e) => e.type.toLowerCase() !== lower,
      )
      const next: Expense[] =
        weight != null && weight > 0
          ? [
              ...without,
              {
                type:
                  current.find((e) => e.type.toLowerCase() === lower)?.type ??
                  type,
                weight,
              },
            ]
          : without
      data.expensesJson = JSON.stringify(next)
    } else if ("expenses" in validated && validated.expenses !== undefined) {
      data.expensesJson = JSON.stringify(validated.expenses)
    }
    if ("boysGrams" in validated) data.boysGrams = validated.boysGrams
    if ("mdaraGrams" in validated) data.mdaraGrams = validated.mdaraGrams
    if ("balGrams" in validated) data.balGrams = validated.balGrams

    // Status + errorMessage handling on edit:
    //   - FAILED rows go back to PENDING (or ANOMALY if a parser warning
    //     still applies) so the next commit treats them fresh.
    //   - ANOMALY rows that have a parserWarning STAY ANOMALY and we
    //     restore their errorMessage from parserWarning, so the inline
    //     warning detail in the preview table doesn't disappear after
    //     each edit.
    //   - All other rows: clear post-commit errorMessage.
    if (entry.status === "FAILED" || entry.status === "ANOMALY") {
      const stayAnomaly = !!entry.parserWarning
      data.status = stayAnomaly ? "ANOMALY" : "PENDING"
      data.errorMessage = stayAnomaly ? entry.parserWarning : null
    } else {
      data.errorMessage = null
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
