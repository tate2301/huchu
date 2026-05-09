import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { parseLedgerCsv } from "@/lib/gold/import-parsing"
import { z } from "zod"

const createImportSchema = z.object({
  csvText: z.string().min(1).max(5_000_000),
  fileName: z.string().max(200).optional(),
  siteId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { page, limit, skip } = getPaginationParams(request)

    const [imports, total] = await Promise.all([
      prisma.goldLedgerImport.findMany({
        where: { companyId: session.user.companyId },
        include: {
          uploadedBy: { select: { id: true, name: true } },
          site: { select: { id: true, name: true, code: true } },
          _count: { select: { entries: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.goldLedgerImport.count({ where: { companyId: session.user.companyId } }),
    ])

    return successResponse(paginationResponse(imports, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/gold/imports error:", error)
    return errorResponse("Failed to list imports")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = createImportSchema.parse(body)

    const parsed = parseLedgerCsv(validated.csvText)
    if (parsed.rows.length === 0) {
      return errorResponse(
        `Could not parse any rows: ${parsed.warnings.join("; ") || "unknown reason"}`,
        400,
      )
    }

    const created = await prisma.$transaction(async (tx) => {
      const importRecord = await tx.goldLedgerImport.create({
        data: {
          companyId: session.user.companyId,
          siteId: validated.siteId,
          uploadedById: session.user.id,
          fileName: validated.fileName ?? "ledger.csv",
          rowsTotal: parsed.rows.length,
          status: "MAPPING",
          notes: validated.notes,
        },
      })

      await tx.goldLedgerEntry.createMany({
        data: parsed.rows.map((row) => {
          const parserWarning =
            row.warnings.length > 0 ? row.warnings.join("; ") : null
          return {
            importId: importRecord.id,
            lineNo: row.lineNo,
            rawJson: row.rawJson,
            parsedDate: row.parsedDate,
            parsedName: row.parsedName,
            gramsTotal: row.gramsTotal,
            expensesJson: JSON.stringify(row.expenses),
            boysGrams: row.boysGrams,
            mdaraGrams: row.mdaraGrams,
            balGrams: row.balGrams,
            status: parserWarning ? "ANOMALY" : "PENDING",
            errorMessage: parserWarning,
            // Persist parser warnings separately so recommit cleanup can
            // wipe transient errorMessage without losing parse-time context.
            parserWarning,
          }
        }),
      })

      return importRecord
    })

    return successResponse(
      {
        id: created.id,
        rowsTotal: created.rowsTotal,
        distinctNames: parsed.distinctNames,
        warnings: parsed.warnings,
      },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/imports error:", error)
    return errorResponse("Failed to create import")
  }
}
