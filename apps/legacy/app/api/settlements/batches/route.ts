import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils"
import { sumMoney } from "@corelithzw/platform/money"
import { generateDisbursementCode } from "@corelithzw/module-people/payroll/disbursements"
import { prisma } from "@corelithzw/db/client"
import { settlementPermissionDenial } from "@/lib/settlements/permissions"
import { parseSettlementSource } from "@/lib/settlements/sources"
import { createApprovalAction } from "@corelithzw/module-workflow/approvals"

/**
 * Paying an approved settlement run.
 *
 * One batch is one currency. A run can hold lines in USD and ZWG — a mine paying
 * some workers in each — and a single batch carrying both has a `totalAmount` in
 * no currency at all, which is the number that then gets handed to a cashier.
 */

const batchSchema = z.object({
  settlementRunId: z.string().uuid(),
  currency: z.string().trim().min(1).max(10),
  method: z.enum(["CASH", "BANK", "MOBILE"]).optional(),
  cashCustodian: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
})

const BATCH_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  run: { select: { id: true, code: true, source: true, periodStart: true, periodEnd: true } },
  items: {
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
    orderBy: { employee: { name: "asc" } },
  },
} as const

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.batch", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const source = parseSettlementSource(searchParams.get("source"))
    const runId = searchParams.get("settlementRunId")
    const status = searchParams.get("status")

    const where: Record<string, unknown> = { companyId: session.user.companyId }
    if (runId) where.settlementRunId = runId
    if (source) where.run = { source }
    if (["DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED"].includes(status ?? "")) {
      where.status = status
    }

    const [records, total] = await Promise.all([
      prisma.settlementBatch.findMany({
        where,
        include: BATCH_INCLUDE,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.settlementBatch.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/settlements/batches error:", error)
    return errorResponse("Failed to fetch settlement batches")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.batch", "create")
    if (denial) return errorResponse(denial, 403)

    const validated = batchSchema.parse(await request.json())
    const currency = validated.currency.trim().toUpperCase()

    const run = await prisma.settlementRun.findUnique({
      where: { id: validated.settlementRunId },
      select: {
        id: true,
        code: true,
        companyId: true,
        status: true,
        lines: { select: { id: true, employeeId: true, netAmount: true, currency: true } },
      },
    })

    if (!run || run.companyId !== session.user.companyId) {
      return errorResponse("Settlement run not found", 404)
    }
    if (run.status !== "APPROVED" && run.status !== "POSTED") {
      return errorResponse("Only an approved settlement run can be paid out", 400)
    }

    const payable = run.lines.filter(
      (line) => line.currency === currency && !line.netAmount.isZero(),
    )
    if (payable.length === 0) {
      return errorResponse(`${run.code} has nothing payable in ${currency}`, 400)
    }

    const alreadyBatched = await prisma.settlementBatchItem.findMany({
      where: {
        batch: { settlementRunId: run.id, status: { not: "REJECTED" } },
        lineId: { in: payable.map((line) => line.id) },
      },
      select: { lineId: true },
    })
    const claimed = new Set(alreadyBatched.map((item) => item.lineId))
    const fresh = payable.filter((line) => !claimed.has(line.id))
    if (fresh.length === 0) {
      return errorResponse(
        `Every ${currency} line on ${run.code} is already in a batch`,
        409,
      )
    }

    const totalAmount = sumMoney(fresh.map((line) => line.netAmount))

    const created = await prisma.$transaction(async (tx) => {
      const batch = await tx.settlementBatch.create({
        data: {
          companyId: session.user.companyId,
          settlementRunId: run.id,
          code: generateDisbursementCode(),
          method: validated.method ?? "CASH",
          cashCustodian: validated.cashCustodian?.trim() || undefined,
          currency,
          totalAmount,
          itemCount: fresh.length,
          notes: validated.notes?.trim() || undefined,
          createdById: session.user.id,
          items: {
            create: fresh.map((line) => ({
              lineId: line.id,
              employeeId: line.employeeId,
              amount: line.netAmount,
              currency,
            })),
          },
        },
        include: BATCH_INCLUDE,
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "SETTLEMENT_BATCH",
        entityId: batch.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
        note: `${currency} settlement batch ${batch.code} created from ${run.code}.`,
      })

      return batch
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/settlements/batches error:", error)
    return errorResponse("Failed to create settlement batch")
  }
}
