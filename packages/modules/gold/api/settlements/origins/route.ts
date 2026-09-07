import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { prisma } from "@corelithzw/db/client"
import { settlementPermissionDenial } from "../../../settlements/permissions"
import { parseSettlementSource } from "../../../settlements/sources"

/**
 * Which upstream records have been settled, and how far along each one is.
 *
 * This is the question the gold payout screen exists to answer, and it used to
 * answer it by pulling every `EmployeePayment` for the window and matching each
 * one back to a shift allocation *by date range* — because nothing linked them.
 * A worker settled twice inside one period matched the wrong row, silently.
 *
 * `SettlementLineOrigin` is that link, so the answer is a join rather than a
 * guess. One caveat is inherent and the response carries it honestly: a line
 * aggregates, so one worker's six shifts in a month settle as one payment.
 * `amount` is that allocation's share of the line — a real number, apportioned
 * at compute time — but `paidAmount` belongs to the *line*, not to any one
 * allocation, and is reported as such rather than pro-rated into a figure
 * nobody could reconcile.
 */

const querySchema = z.object({
  source: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  goldShiftAllocationId: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.run", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      source: searchParams.get("source") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      goldShiftAllocationId: searchParams.get("goldShiftAllocationId") ?? undefined,
    })
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.issues)
    }

    const source = parseSettlementSource(parsed.data.source)
    const runWhere: Record<string, unknown> = {
      companyId: session.user.companyId,
      // A rejected run settles nothing. Including it would report work as
      // settled that is back on the pile.
      status: { not: "REJECTED" },
    }
    if (source) runWhere.source = source
    if (parsed.data.startDate) {
      runWhere.periodEnd = { gte: new Date(parsed.data.startDate) }
    }
    if (parsed.data.endDate) {
      runWhere.periodStart = { lte: new Date(parsed.data.endDate) }
    }

    const origins = await prisma.settlementLineOrigin.findMany({
      where: {
        ...(parsed.data.goldShiftAllocationId
          ? { goldShiftAllocationId: parsed.data.goldShiftAllocationId }
          : {}),
        line: { run: runWhere },
      },
      select: {
        id: true,
        goldShiftAllocationId: true,
        settlementIntakeId: true,
        quantity: true,
        amount: true,
        line: {
          select: {
            id: true,
            employeeId: true,
            quantity: true,
            unit: true,
            unitRate: true,
            netAmount: true,
            currency: true,
            employee: { select: { id: true, employeeId: true, name: true } },
            run: {
              select: {
                id: true,
                code: true,
                status: true,
                dueDate: true,
                periodStart: true,
                periodEnd: true,
              },
            },
            items: {
              where: { batch: { status: { not: "REJECTED" } } },
              select: {
                id: true,
                amount: true,
                paidAmount: true,
                paidAt: true,
                status: true,
                batch: { select: { id: true, code: true, status: true } },
              },
            },
          },
        },
      },
      orderBy: { line: { run: { periodEnd: "desc" } } },
    })

    return successResponse({
      data: origins.map((origin) => {
        // At most one live batch item per line — `SettlementBatch` creation skips
        // lines already claimed by a non-rejected batch.
        const item = origin.line.items[0] ?? null
        return {
          id: origin.id,
          goldShiftAllocationId: origin.goldShiftAllocationId,
          settlementIntakeId: origin.settlementIntakeId,
          /// This allocation's share of the line.
          quantity: origin.quantity,
          amount: origin.amount,
          line: {
            id: origin.line.id,
            employee: origin.line.employee,
            quantity: origin.line.quantity,
            unit: origin.line.unit,
            unitRate: origin.line.unitRate,
            netAmount: origin.line.netAmount,
            currency: origin.line.currency,
          },
          run: origin.line.run,
          payment: item
            ? {
                batchId: item.batch.id,
                batchCode: item.batch.code,
                batchStatus: item.batch.status,
                /// The whole line's, not this allocation's.
                amount: item.amount,
                paidAmount: item.paidAmount,
                paidAt: item.paidAt,
                status: item.status,
              }
            : null,
        }
      }),
    })
  } catch (error) {
    console.error("[API] GET /api/settlements/origins error:", error)
    return errorResponse("Failed to fetch what has been settled")
  }
}
