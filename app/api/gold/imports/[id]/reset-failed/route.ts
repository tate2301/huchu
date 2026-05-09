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
 * Reset only the failed rows of an import — wipes any artifacts they
 * produced (rare; usually FAILED rows produced nothing), then resets
 * them to PENDING (or ANOMALY if a parser warning still applies). The
 * import's other rows (CREATED / ANOMALY-saved) are untouched.
 *
 * Useful when most rows committed cleanly but a handful failed mid-run
 * (Prisma error, constraint, etc.) and the operator wants to retry
 * just the failures.
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
      return errorResponse("Manager-level access required to reset failed imports", 403)
    }

    const { id } = await params

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    })
    if (!importRecord || importRecord.companyId !== session.user.companyId) {
      return errorResponse("Import not found", 404)
    }

    const failedEntries = await prisma.goldLedgerEntry.findMany({
      where: { importId: id, status: "FAILED" },
      select: {
        id: true,
        goldShiftAllocationId: true,
        goldPourId: true,
        buyerReceiptId: true,
        parserWarning: true,
      },
    })

    if (failedEntries.length === 0) {
      return errorResponse("No failed rows to reset.", 400)
    }

    const summary = await prisma.$transaction(async (tx) => {
      const purge = await purgeImportArtifacts(tx, {
        importId: id,
        entries: failedEntries,
      })
      await resetEntriesAfterPurge(tx, id, {
        onlyEntryIds: failedEntries.map((e) => e.id),
      })
      // If the import was marked FAILED purely because some rows failed,
      // and we've reset them, surface as PREVIEW so the commit button
      // becomes available again.
      const remainingFailed = await tx.goldLedgerEntry.count({
        where: { importId: id, status: "FAILED" },
      })
      if (importRecord.status === "FAILED" && remainingFailed === 0) {
        await tx.goldLedgerImport.update({
          where: { id },
          data: { status: "PREVIEW" },
        })
      }
      return { ...purge, resetCount: failedEntries.length }
    })

    return successResponse(summary)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/reset-failed error:", error)
    return errorResponse("Failed to reset failed rows")
  }
}
