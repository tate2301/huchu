import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { ensureHrPayrollDefaults } from "@/lib/hr/bootstrap"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { prisma } from "@corelithzw/db/client"

/**
 * What is in force for a given month.
 *
 * Read-only, and scoped to one month rather than returning everything ever
 * entered. The question an operator has before running payroll is "what will
 * this use", not "what have we ever had" — and a list of every historical row
 * makes the current one harder to find, which is the opposite of the point.
 *
 * Effective-dating means the same predicate as `lib/hr/statutory/tables.ts`:
 * started on or before the month end, and not ended by the month start.
 */

const querySchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}$/, { message: "asOf must look like 2026-08" }),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.statutory", "view")
    if (denial) return errorResponse(denial, 403)

    const parsed = querySchema.safeParse({
      asOf: request.nextUrl.searchParams.get("asOf") ?? "",
    })
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.issues)
    }

    const companyId = session.user.companyId
    // A workspace that has just enabled the addon has no tables yet. Seeding here
    // means the screen shows the starting set rather than an empty page that
    // looks like a bug.
    await ensureHrPayrollDefaults(companyId)

    const [year, month] = parsed.data.asOf.split("-").map(Number)
    const monthStart = new Date(Date.UTC(year, month - 1, 1))
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

    const covers = {
      effectiveFrom: { lte: monthEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
    }

    const [payeTables, rates, credits, necAgreements] = await Promise.all([
      prisma.payeTable.findMany({
        where: { companyId, ...covers },
        orderBy: [{ currency: "asc" }, { effectiveFrom: "desc" }],
        include: {
          bands: {
            orderBy: [{ sortOrder: "asc" }, { lowerBound: "asc" }],
            select: {
              lowerBound: true,
              upperBound: true,
              ratePercent: true,
              deductAmount: true,
            },
          },
        },
      }),
      prisma.statutoryRate.findMany({
        where: { companyId, ...covers },
        orderBy: [{ key: "asc" }, { currency: "asc" }, { effectiveFrom: "desc" }],
      }),
      prisma.taxCredit.findMany({
        where: { companyId, ...covers },
        orderBy: [{ key: "asc" }, { currency: "asc" }, { effectiveFrom: "desc" }],
      }),
      prisma.necAgreement.findMany({
        where: { companyId, isActive: true, ...covers },
        orderBy: [{ effectiveFrom: "desc" }],
      }),
    ])

    // Two rows for one key happen when a revision starts mid-window. The newest
    // wins, which is what the resolver does, so the screen must not show both or
    // it would disagree with the payroll.
    const newestByKey = <T extends { effectiveFrom: Date }>(
      rows: T[],
      key: (row: T) => string,
    ) => {
      const seen = new Map<string, T>()
      for (const row of rows) if (!seen.has(key(row))) seen.set(key(row), row)
      return Array.from(seen.values())
    }

    const currentTables = newestByKey(payeTables, (row) => `${row.currency}:${row.cycle}`)
    const currentRates = newestByKey(rates, (row) => `${row.key}:${row.currency ?? ""}`)
    const currentCredits = newestByKey(credits, (row) => `${row.key}:${row.currency}`)

    return successResponse({
      asOf: parsed.data.asOf,
      payeTables: currentTables,
      rates: currentRates,
      credits: currentCredits,
      necAgreements,
      seededCount:
        currentTables.filter((row) => row.isSeeded).length +
        currentRates.filter((row) => row.isSeeded).length +
        currentCredits.filter((row) => row.isSeeded).length,
    })
  } catch (error) {
    console.error("[API] GET /api/payroll/statutory error:", error)
    return errorResponse("Failed to load statutory tables")
  }
}
