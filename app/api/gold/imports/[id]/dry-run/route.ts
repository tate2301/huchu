import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { runImportDryRun } from "@/lib/gold/import-validators"

/**
 * Read-only validation pass that mirrors the rules the commit endpoint
 * applies. Returns anomalies grouped by severity so the import wizard
 * can gate Commit on CRITICAL=0 (or all-WARNs explicitly accepted).
 */
export async function POST(
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
      include: { entries: { orderBy: { lineNo: "asc" } } },
    })
    if (!importRecord || importRecord.companyId !== session.user.companyId) {
      return errorResponse("Import not found", 404)
    }

    const summary = await runImportDryRun(prisma, {
      id: importRecord.id,
      companyId: importRecord.companyId,
      siteId: importRecord.siteId,
      mappingsJson: importRecord.mappingsJson,
      entries: importRecord.entries.map((e) => ({
        id: e.id,
        lineNo: e.lineNo,
        parsedDate: e.parsedDate,
        parsedName: e.parsedName,
        mappedShiftGroupId: e.mappedShiftGroupId,
        gramsTotal: e.gramsTotal,
        expensesJson: e.expensesJson,
        boysGrams: e.boysGrams,
        mdaraGrams: e.mdaraGrams,
        balGrams: e.balGrams,
        parserWarning: e.parserWarning,
      })),
    })

    return successResponse(summary)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/dry-run error:", error)
    return errorResponse("Failed to run dry-run validation")
  }
}
