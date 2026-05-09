import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  hasRole,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import {
  purgeImportArtifacts,
  resetEntriesAfterPurge,
} from "@/lib/gold/import-cleanup"

/**
 * Roll back a committed import. Wipes every record the import produced
 * (allocations, pours, receipts, inventory + accounting events,
 * exceptions, attendance, shift reports), resets the entries to PENDING
 * (preserving parser-origin anomalies), and flips the import status to
 * ROLLED_BACK so the operator can edit + re-commit cleanly.
 *
 * Manager / superadmin only.
 */
// TODO (Epic 9b): require co-sign when rowsTotal > 100 or estimated USD > threshold
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["MANAGER", "SUPERADMIN"])) {
      return errorResponse("Manager-level access required", 403)
    }

    const { id } = await params

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    })
    if (!importRecord || importRecord.companyId !== session.user.companyId) {
      return errorResponse("Import not found", 404)
    }
    if (
      importRecord.status !== "COMMITTED" &&
      importRecord.status !== "FAILED"
    ) {
      return errorResponse(
        "Only committed or failed imports can be rolled back.",
        409,
      )
    }

    const summary = await prisma.$transaction(async (tx) => {
      const purge = await purgeImportArtifacts(tx, { importId: id })
      await resetEntriesAfterPurge(tx, id)
      const updated = await tx.goldLedgerImport.update({
        where: { id },
        data: {
          status: "ROLLED_BACK",
          rowsCreated: 0,
          rowsAnomaly: 0,
          rowsFailed: 0,
          rowsSkipped: 0,
          committedAt: null,
        },
      })
      return { ...purge, status: updated.status }
    })

    return successResponse(summary)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/rollback error:", error)
    return errorResponse("Failed to roll back import")
  }
}
