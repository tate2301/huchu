import { NextRequest, NextResponse } from "next/server"
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)

    const periodId = searchParams.get("periodId")
    const status = searchParams.get("status")
    const domain = searchParams.get("domain")
    const search = searchParams.get("search")?.trim()

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }
    if (periodId) where.periodId = periodId
    if (status) where.status = status
    if (domain === "PAYROLL" || domain === "GOLD_PAYOUT") where.domain = domain
    if (search) {
      const normalizedSearch = search.toUpperCase()
      const runNumber = Number(search)
      where.OR = [
        { notes: { contains: search, mode: "insensitive" } },
        { period: { periodKey: { contains: search, mode: "insensitive" } } },
        ...(Number.isFinite(runNumber) ? [{ runNumber }] : []),
        ...(normalizedSearch === "PAYROLL" || normalizedSearch === "GOLD_PAYOUT"
          ? [{ domain: normalizedSearch }]
          : []),
        ...((
          ["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "REJECTED"] as const
        ).includes(
          normalizedSearch as "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED",
        )
          ? [{ status: normalizedSearch }]
          : []),
      ]
    }

    const [records, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        include: {
          period: {
            select: { id: true, periodKey: true, startDate: true, endDate: true, dueDate: true },
          },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          _count: { select: { lineItems: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.payrollRun.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/payroll/runs error:", error)
    return errorResponse("Failed to fetch payroll runs")
  }
}
