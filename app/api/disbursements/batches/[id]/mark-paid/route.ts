import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { AUTO_PAYOUT_NOTE_PREFIX } from "@/lib/gold-payouts"
import { prisma } from "@/lib/prisma"
import {
  createApprovalAction,
  derivePaidStatus,
  ensureApproverRole,
} from "@/lib/hr-payroll"

const markPaidSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        paidAmount: z.number().min(0).optional(),
        paidAt: z
          .string()
          .datetime()
          .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
          .optional(),
        receiptReference: z.string().max(200).optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params
    const body = await request.json()
    const validated = markPaidSchema.parse(body)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to record disbursements", 403)
    }

    const batch = await prisma.disbursementBatch.findUnique({
      where: { id },
      include: {
        payrollRun: {
          include: {
            period: { select: { startDate: true, endDate: true, dueDate: true } },
          },
        },
        items: {
          include: {
            lineItem: { select: { currency: true } },
          },
        },
      },
    })

    if (!batch || batch.companyId !== session.user.companyId) {
      return errorResponse("Disbursement batch not found", 404)
    }
    if (batch.method !== "CASH") {
      return errorResponse("Only cash disbursement batches are supported", 400)
    }
    if (!["APPROVED", "PAID"].includes(batch.status)) {
      return errorResponse("Batch must be approved before recording payments", 400)
    }
    if (
      batch.payrollRun.domain === "GOLD_PAYOUT" &&
      (!batch.payrollRun.goldRatePerUnit || batch.payrollRun.goldRatePerUnit <= 0)
    ) {
      return errorResponse("Gold payout runs require a positive gold rate before disbursement", 400)
    }

    const pendingAdjustments = await prisma.adjustmentEntry.count({
      where: {
        disbursementBatchId: id,
        status: { in: ["DRAFT", "SUBMITTED"] },
      },
    })
    if (pendingAdjustments > 0) {
      return errorResponse("Resolve pending adjustments before recording payments", 409)
    }

    const itemById = new Map(batch.items.map((item) => [item.id, item]))
    for (const payload of validated.items) {
      if (!itemById.has(payload.id)) {
        return errorResponse("Invalid disbursement item in request", 400)
      }
    }

    const updatedBatch = await prisma.$transaction(async (tx) => {
      const isGoldRun = batch.payrollRun.domain === "GOLD_PAYOUT"

      for (const payload of validated.items) {
        const item = itemById.get(payload.id)!
        const paidAmount = payload.paidAmount ?? item.amount
        const status = derivePaidStatus(item.amount, paidAmount)
        const paidAt =
          paidAmount > 0 ? (payload.paidAt ? new Date(payload.paidAt) : new Date()) : null

        const updatedItem = await tx.disbursementItem.update({
          where: { id: payload.id },
          data: {
            paidAmount,
            status,
            paidAt,
            receiptReference: payload.receiptReference,
            notes: payload.notes,
          },
          include: { lineItem: { select: { currency: true } } },
        })

        if (isGoldRun) {
          const linkedGoldPayments = await tx.employeePayment.findMany({
            where: {
              employeeId: updatedItem.employeeId,
              type: "GOLD",
              notes: { startsWith: AUTO_PAYOUT_NOTE_PREFIX },
              ...(batch.payrollRun.goldSettlementMode === "NEXT_PERIOD"
                ? {
                    dueDate: {
                      gte: batch.payrollRun.period.startDate,
                      lte: batch.payrollRun.period.endDate,
                    },
                  }
                : {
                    periodStart: { lte: batch.payrollRun.period.endDate },
                    periodEnd: { gte: batch.payrollRun.period.startDate },
                  }),
            },
            orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
          })

          if (linkedGoldPayments.length > 0 && (batch.payrollRun.goldRatePerUnit ?? 0) > 0) {
            let remainingGoldPaid =
              (updatedItem.paidAmount ?? 0) / (batch.payrollRun.goldRatePerUnit ?? 1)

            for (const linked of linkedGoldPayments) {
              const paidGoldForRecord =
                remainingGoldPaid > 0 ? Math.min(linked.amount, remainingGoldPaid) : 0
              remainingGoldPaid = Math.max(remainingGoldPaid - paidGoldForRecord, 0)

              await tx.employeePayment.update({
                where: { id: linked.id },
                data: {
                  paidAmount: paidGoldForRecord > 0 ? paidGoldForRecord : null,
                  paidAt: paidGoldForRecord > 0 ? updatedItem.paidAt : null,
                  status: derivePaidStatus(linked.amount, paidGoldForRecord),
                  notes: linked.notes ?? `AUTO_PAYOUT_FROM_SHIFT_ALLOCATION:${batch.id}`,
                  payrollRunId: batch.payrollRunId,
                  payrollLineItemId: updatedItem.lineItemId,
                  disbursementBatchId: batch.id,
                  disbursementItemId: updatedItem.id,
                },
              })
            }
          } else {
            await tx.employeePayment.create({
              data: {
                employeeId: updatedItem.employeeId,
                type: "GOLD",
                periodStart: batch.payrollRun.period.startDate,
                periodEnd: batch.payrollRun.period.endDate,
                dueDate: batch.payrollRun.period.dueDate,
                amount: updatedItem.amount,
                unit: updatedItem.lineItem.currency,
                paidAmount: updatedItem.paidAmount,
                paidAt: updatedItem.paidAt,
                status: updatedItem.status,
                notes: updatedItem.notes ?? `Gold disbursement batch ${batch.code}`,
                createdById: session.user.id,
                payrollRunId: batch.payrollRunId,
                payrollLineItemId: updatedItem.lineItemId,
                disbursementBatchId: batch.id,
                disbursementItemId: updatedItem.id,
              },
            })
          }
        } else {
          const existingPayment = await tx.employeePayment.findFirst({
            where: { disbursementItemId: updatedItem.id },
            select: { id: true },
          })

          if (existingPayment) {
            await tx.employeePayment.update({
              where: { id: existingPayment.id },
              data: {
                amount: updatedItem.amount,
                paidAmount: updatedItem.paidAmount,
                paidAt: updatedItem.paidAt,
                status: updatedItem.status,
                notes: updatedItem.notes ?? `Disbursement batch ${batch.code}`,
              },
            })
          } else {
            await tx.employeePayment.create({
              data: {
                employeeId: updatedItem.employeeId,
                type: "SALARY",
                periodStart: batch.payrollRun.period.startDate,
                periodEnd: batch.payrollRun.period.endDate,
                dueDate: batch.payrollRun.period.dueDate,
                amount: updatedItem.amount,
                unit: updatedItem.lineItem.currency,
                paidAmount: updatedItem.paidAmount,
                paidAt: updatedItem.paidAt,
                status: updatedItem.status,
                notes: updatedItem.notes ?? `Disbursement batch ${batch.code}`,
                createdById: session.user.id,
                payrollRunId: batch.payrollRunId,
                payrollLineItemId: updatedItem.lineItemId,
                disbursementBatchId: batch.id,
                disbursementItemId: updatedItem.id,
              },
            })
          }
        }
      }

      const counts = await tx.disbursementItem.groupBy({
        by: ["status"],
        where: { batchId: id },
        _count: { _all: true },
      })
      const totalItems = counts.reduce((sum, row) => sum + row._count._all, 0)
      const paidItems =
        counts.find((row) => row.status === "PAID")?._count._all ?? 0
      const nextStatus = totalItems > 0 && paidItems === totalItems ? "PAID" : "APPROVED"

      const savedBatch = await tx.disbursementBatch.update({
        where: { id },
        data: {
          status: nextStatus,
          paidAt: nextStatus === "PAID" ? new Date() : null,
        },
        include: {
          payrollRun: {
            include: {
              period: {
                select: { id: true, periodKey: true, startDate: true, endDate: true, dueDate: true },
              },
            },
          },
          items: {
            include: {
              employee: { select: { id: true, employeeId: true, name: true } },
            },
            orderBy: { employee: { name: "asc" } },
          },
        },
      })

      await tx.payrollRun.updateMany({
        where: {
          id: batch.payrollRunId,
          companyId: session.user.companyId,
          status: "APPROVED",
        },
        data: {
          status: "POSTED",
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "DISBURSEMENT_BATCH",
        entityId: id,
        action: "ADJUST",
        actedById: session.user.id,
        fromStatus: batch.status,
        toStatus: savedBatch.status,
        note: "Recorded disbursement item payment updates.",
      })

      return savedBatch
    })

    return successResponse(updatedBatch)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/disbursements/batches/[id]/mark-paid error:", error)
    return errorResponse("Failed to record disbursement payments")
  }
}
