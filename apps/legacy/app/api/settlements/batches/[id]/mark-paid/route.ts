import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { money, sumMoney } from "@/lib/money"
import { prisma } from "@corelithzw/db/client"
import { recordSettlementPayment } from "@/lib/settlements/payments"
import { settlementPermissionDenial } from "@/lib/settlements/permissions"
import { createApprovalAction } from "@/lib/workflow/approvals"

/**
 * Money out the door.
 *
 * Each item carries what was actually handed over, which is not always what was
 * owed — a cashier short of small change pays 47 against 47.50 and the balance
 * stays outstanding. So `paidAmount` is per item and the batch is PAID only when
 * every item is settled in full.
 */

const markPaidSchema = z.object({
  paidAt: z.string().datetime().optional(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        paidAmount: z.number().nonnegative(),
        receiptReference: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(1000),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.batch", "disburse")
    if (denial) return errorResponse(denial, 403)

    const { id } = await params
    const validated = markPaidSchema.parse(await request.json())
    const paidAt = validated.paidAt ? new Date(validated.paidAt) : new Date()

    const batch = await prisma.settlementBatch.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        companyId: true,
        status: true,
        currency: true,
        settlementRunId: true,
        run: {
          select: { source: true, periodStart: true, periodEnd: true, dueDate: true },
        },
        items: {
          select: {
            id: true,
            employeeId: true,
            amount: true,
            paidAmount: true,
            paidAt: true,
            currency: true,
            lineId: true,
            notes: true,
            line: { select: { quantity: true, unit: true, unitRate: true } },
          },
        },
      },
    })

    if (!batch || batch.companyId !== session.user.companyId) {
      return errorResponse("Settlement batch not found", 404)
    }
    if (batch.status !== "APPROVED" && batch.status !== "PAID") {
      return errorResponse("Only an approved settlement batch can be paid", 400)
    }

    const itemsById = new Map(batch.items.map((item) => [item.id, item]))
    const unknown = validated.items.filter((entry) => !itemsById.has(entry.itemId))
    if (unknown.length > 0) {
      return errorResponse("One or more items do not belong to this batch", 400)
    }

    for (const entry of validated.items) {
      const item = itemsById.get(entry.itemId)!
      if (money(entry.paidAmount).greaterThan(money(item.amount))) {
        return errorResponse(
          `Paid amount for one item exceeds the ${item.amount.toString()} owed`,
          400,
        )
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      for (const entry of validated.items) {
        const item = itemsById.get(entry.itemId)!
        const paidAmount = money(entry.paidAmount)
        const settledInFull = paidAmount.greaterThanOrEqualTo(money(item.amount))

        const savedItem = await tx.settlementBatchItem.update({
          where: { id: item.id },
          data: {
            paidAmount,
            paidAt: paidAmount.isZero() ? null : paidAt,
            status: paidAmount.isZero()
              ? "DUE"
              : settledInFull
                ? "PAID"
                : "PARTIAL",
            receiptReference: entry.receiptReference?.trim() || undefined,
          },
          select: {
            id: true,
            employeeId: true,
            amount: true,
            paidAmount: true,
            paidAt: true,
            currency: true,
            lineId: true,
            notes: true,
            line: { select: { quantity: true, unit: true, unitRate: true } },
          },
        })

        await recordSettlementPayment(tx, {
          item: savedItem,
          batch: {
            id: batch.id,
            code: batch.code,
            companyId: batch.companyId,
            settlementRunId: batch.settlementRunId,
            run: batch.run,
          },
          createdById: session.user.id,
        })
      }

      const items = await tx.settlementBatchItem.findMany({
        where: { batchId: batch.id },
        select: { amount: true, paidAmount: true },
      })
      const fullySettled = items.every(
        (item) =>
          item.paidAmount !== null &&
          money(item.paidAmount).greaterThanOrEqualTo(money(item.amount)),
      )

      const saved = await tx.settlementBatch.update({
        where: { id: batch.id },
        data: {
          status: fullySettled ? "PAID" : "APPROVED",
          paidAt: fullySettled ? paidAt : null,
          totalAmount: sumMoney(items.map((item) => item.amount)),
        },
        include: {
          run: { select: { id: true, code: true, source: true } },
          items: {
            include: { employee: { select: { id: true, employeeId: true, name: true } } },
            orderBy: { employee: { name: "asc" } },
          },
        },
      })

      await createApprovalAction(tx, {
        companyId: batch.companyId,
        entityType: "SETTLEMENT_BATCH",
        entityId: batch.id,
        action: "ADJUST",
        actedById: session.user.id,
        fromStatus: batch.status,
        toStatus: saved.status,
        note: fullySettled
          ? `${batch.code} paid in full.`
          : `${batch.code} part-paid; a balance remains outstanding.`,
      })

      return saved
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/settlements/batches/[id]/mark-paid error:", error)
    return errorResponse("Failed to mark settlement batch paid")
  }
}
