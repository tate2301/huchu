import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { prisma } from "@corelithzw/db/client"
import { createJournalEntryFromSource } from "@/lib/accounting/posting"
import { derivePaidStatus } from "@/lib/payroll/disbursements"
import { createApprovalAction, ensureApproverRole } from "@/lib/workflow/approvals"
import { isPositive, money } from "@corelithzw/platform/money"
import { writePlatformAuditEvent } from "@corelithzw/platform/audit/platform"
import { createRouteLogger } from "@corelithzw/platform/observability/route-logger"

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
  const logger = createRouteLogger({
    route: "/api/disbursements/batches/[id]/mark-paid",
    request,
  })
  logger.info("start")

  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.disbursements", "disburse")
    if (denial) return errorResponse(denial, 403)
    const { id } = await params
    const body = await request.json()
    const validated = markPaidSchema.parse(body)
    logger.info("mark_disbursement_paid_requested", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      disbursementBatchId: id,
      itemCount: validated.items.length,
    })

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
            lineItem: { select: { currency: true, baseAmount: true, netAmount: true } },
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
    const pendingAdjustments = await prisma.adjustmentEntry.count({
      where: {
        disbursementBatchId: id,
        status: { in: ["DRAFT", "SUBMITTED"] },
      },
    })
    if (pendingAdjustments > 0) {
      logger.info("mark_disbursement_paid_pending_adjustments", {
        companyId: session.user.companyId,
        actorId: session.user.id,
        disbursementBatchId: id,
        pendingAdjustments,
        statusCode: 409,
      })
      return errorResponse("Resolve pending adjustments before recording payments", 409)
    }

    const itemById = new Map(batch.items.map((item) => [item.id, item]))
    for (const payload of validated.items) {
      if (!itemById.has(payload.id)) {
        return errorResponse("Invalid disbursement item in request", 400)
      }
    }

    const updatedBatch = await prisma.$transaction(async (tx) => {
      // One branch, not three. A disbursement batch is payroll — the gold and
      // "irregular" branches that used to live here wrote money into a `Float`
      // column that a gold payout read as grams, and paying a settlement is
      // `SettlementBatch`'s job now.
      for (const payload of validated.items) {
        const item = itemById.get(payload.id)!
        const paidAmount = money(payload.paidAmount ?? item.amount)
        const status = derivePaidStatus(item.amount, paidAmount)
        const paidAt = isPositive(paidAmount)
          ? payload.paidAt
            ? new Date(payload.paidAt)
            : new Date()
          : null

        const updatedItem = await tx.disbursementItem.update({
          where: { id: payload.id },
          data: {
            paidAmount,
            status,
            paidAt,
            receiptReference: payload.receiptReference,
            notes: payload.notes,
          },
          include: { lineItem: { select: { currency: true, baseAmount: true, netAmount: true } } },
        })

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

      // Money leaving the business. On the chain, inside the transaction, so the
      // payment and the record of who authorised it commit together.
      await writePlatformAuditEvent(
        {
          companyId: session.user.companyId,
          actorId: session.user.id,
          eventType: "hr.disbursement.paid",
          entityType: "DISBURSEMENT_BATCH",
          entityId: id,
          payload: {
            code: savedBatch.code,
            method: savedBatch.method,
            currency: savedBatch.currency,
            totalAmount: savedBatch.totalAmount.toFixed(2),
            itemsPaid: validated.items.length,
            status: savedBatch.status,
          },
        },
        tx,
      )

      return savedBatch
    })

    try {
      // No domain check. Every disbursement batch is payroll, so every paid one
      // posts; a settlement posts through its own run.
      if (updatedBatch.status === "PAID") {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "PAYROLL_DISBURSEMENT",
          sourceId: updatedBatch.id,
          entryDate: updatedBatch.paidAt ?? new Date(),
          description: `Payroll disbursement batch ${updatedBatch.code} paid`,
          createdById: session.user.id,
          // A batch is one currency, and the entry has to say which — without
          // it a ZWG payout posted ZWG figures into a USD ledger.
          currency: updatedBatch.currency,
          amount: updatedBatch.totalAmount,
          netAmount: updatedBatch.totalAmount,
          taxAmount: 0,
          grossAmount: updatedBatch.totalAmount,
        })
      }
    } catch (error) {
      logger.error("disbursement_auto_post_failed", error, {
        companyId: session.user.companyId,
        actorId: session.user.id,
        payrollRunId: updatedBatch.payrollRun.id,
        disbursementBatchId: updatedBatch.id,
        batchStatus: updatedBatch.status,
      })
    }

    logger.info("mark_disbursement_paid_success", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      payrollRunId: updatedBatch.payrollRun.id,
      disbursementBatchId: updatedBatch.id,
      itemCount: updatedBatch.items.length,
      batchStatus: updatedBatch.status,
      statusCode: 200,
    })
    return successResponse(updatedBatch)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    logger.error("mark_disbursement_paid_failed", error)
    return errorResponse("Failed to record disbursement payments")
  }
}
