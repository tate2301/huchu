import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions"
import { captureAccountingEvent } from "@corelithzw/module-books/integration"
import { prisma } from "@corelithzw/db/client"
import { createApprovalAction, ensureApproverRole, isTwoStepActionAllowed } from "@corelithzw/module-workflow/approvals"
import { money, toBaseAmount, toNumberOrZero } from "@corelithzw/platform/money"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.payroll", "approve")
    if (denial) return errorResponse(denial, 403)
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to approve adjustments", 403)
    }

    const existing = await prisma.adjustmentEntry.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        submittedById: true,
        targetType: true,
        amountDelta: true,
        reason: true,
        payrollRunId: true,
        disbursementBatchId: true,
        lineItemId: true,
        disbursementItemId: true,
        payrollRun: { select: { status: true } },
        disbursementBatch: { select: { status: true } },
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Adjustment not found", 404)
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Only submitted adjustments can be approved", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }
    if (existing.payrollRun && existing.payrollRun.status !== "DRAFT") {
      return errorResponse("Payroll run must be in draft to approve adjustment", 409)
    }
    if (existing.disbursementBatch && existing.disbursementBatch.status !== "DRAFT") {
      return errorResponse("Disbursement batch must be in draft to approve adjustment", 409)
    }

    // An adjustment moves net pay, and it has to move the numbers net pay
    // follows from as well. Previously it incremented `netAmount` alone, leaving
    // a line whose own three figures contradicted each other:
    // gross − deductions no longer equalled net, so the payslip and the journal
    // disagreed and the run's own totals were internally inconsistent.
    //
    // A positive delta is an extra payment: gross and allowances rise with net.
    // A negative delta is an extra withholding: deductions rise and net falls.
    // Either way the identity holds.
    //
    // What this deliberately does NOT do is re-strike PAYE. An adjustment is a
    // correction applied after tax — a bank detail fixed, a day's pay restored.
    // A change that *should* be taxed belongs in a compensation rule and a
    // regenerated run, not here, and pretending otherwise would file a P2 that
    // does not match the payslips.
    const delta = money(existing.amountDelta)
    const isCredit = delta.isPositive()
    const magnitudeDecimal = delta.abs()

    const lineMovement = isCredit
      ? {
          grossAmount: { increment: magnitudeDecimal },
          allowancesTotal: { increment: magnitudeDecimal },
          netAmount: { increment: magnitudeDecimal },
        }
      : {
          deductionsTotal: { increment: magnitudeDecimal },
          netAmount: { decrement: magnitudeDecimal },
        }

    const runMovement = isCredit
      ? {
          grossTotal: { increment: magnitudeDecimal },
          allowancesTotal: { increment: magnitudeDecimal },
          netTotal: { increment: magnitudeDecimal },
        }
      : {
          deductionsTotal: { increment: magnitudeDecimal },
          netTotal: { decrement: magnitudeDecimal },
        }

    const updated = await prisma.$transaction(async (tx) => {
      if (existing.targetType === "PAYROLL_LINE_ITEM") {
        if (!existing.lineItemId || !existing.payrollRunId) {
          throw new Error("Invalid payroll line-item adjustment")
        }
        const line = await tx.payrollLineItem.update({
          where: { id: existing.lineItemId },
          data: lineMovement,
          select: { exchangeRate: true, netAmount: true },
        })
        // `netBaseAmount` is what the ledger posts, so it has to move with net
        // rather than keep the pre-adjustment figure.
        await tx.payrollLineItem.update({
          where: { id: existing.lineItemId },
          data: { netBaseAmount: toBaseAmount(line.netAmount, line.exchangeRate) },
        })
        // The adjustment shows on the payslip as the line it is, rather than as
        // an unexplained difference between gross and net.
        await tx.payrollLineComponent.create({
          data: {
            lineItemId: existing.lineItemId,
            name: `Adjustment — ${existing.reason}`.slice(0, 200),
            type: isCredit ? "ALLOWANCE" : "DEDUCTION",
            calcMethod: "FIXED",
            rateOrAmount: magnitudeDecimal,
            amount: magnitudeDecimal,
            isTaxable: false,
            sequence: 300,
          },
        })
        await tx.payrollRun.update({
          where: { id: existing.payrollRunId },
          data: runMovement,
        })
      } else if (existing.targetType === "PAYROLL_RUN") {
        if (!existing.payrollRunId) throw new Error("Invalid payroll-run adjustment")
        await tx.payrollRun.update({
          where: { id: existing.payrollRunId },
          data: runMovement,
        })
      } else if (existing.targetType === "DISBURSEMENT_ITEM") {
        if (!existing.disbursementItemId || !existing.disbursementBatchId) {
          throw new Error("Invalid disbursement-item adjustment")
        }
        const item = await tx.disbursementItem.update({
          where: { id: existing.disbursementItemId },
          data: { amount: { increment: existing.amountDelta } },
          select: { amount: true, exchangeRate: true },
        })
        await tx.disbursementItem.update({
          where: { id: existing.disbursementItemId },
          data: { baseAmount: toBaseAmount(item.amount, item.exchangeRate) },
        })
        await tx.disbursementBatch.update({
          where: { id: existing.disbursementBatchId },
          data: { totalAmount: { increment: existing.amountDelta } },
        })
      } else if (existing.targetType === "DISBURSEMENT_BATCH") {
        if (!existing.disbursementBatchId) throw new Error("Invalid disbursement-batch adjustment")
        await tx.disbursementBatch.update({
          where: { id: existing.disbursementBatchId },
          data: { totalAmount: { increment: existing.amountDelta } },
        })
      }

      const adjustment = await tx.adjustmentEntry.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "ADJUSTMENT_ENTRY",
        entityId: adjustment.id,
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
        note: adjustment.reason,
      })

      return adjustment
    })

    try {
      const sourceType =
        updated.targetType === "DISBURSEMENT_BATCH" || updated.targetType === "DISBURSEMENT_ITEM"
          ? "PAYROLL_DISBURSEMENT"
          : "PAYROLL_RUN"
      // The event carries the size of the correction and a direction flag, so
      // the sign lives in `invertDirection` and never in the amount.
      const magnitude = toNumberOrZero(updated.amountDelta.abs())
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "payroll",
        sourceAction: "adjustment-approved",
        sourceType,
        sourceId: updated.id,
        entryDate: updated.approvedAt,
        description: `Adjustment ${updated.id} approved`,
        amount: magnitude,
        netAmount: magnitude,
        grossAmount: magnitude,
        payload: {
          targetType: updated.targetType,
          payrollRunId: updated.payrollRunId,
          disbursementBatchId: updated.disbursementBatchId,
          invertDirection: updated.amountDelta.isNegative(),
        },
        createdById: session.user.id,
        status: "PENDING",
      })
    } catch (error) {
      console.error("[Accounting] Adjustment approval capture failed:", error)
    }

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/adjustments/[id]/approve error:", error)
    return errorResponse("Failed to approve adjustment")
  }
}
