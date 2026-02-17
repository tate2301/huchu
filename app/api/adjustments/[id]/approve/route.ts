import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { captureAccountingEvent } from "@/lib/accounting/integration"
import { prisma } from "@/lib/prisma"
import {
  createApprovalAction,
  ensureApproverRole,
  isTwoStepActionAllowed,
} from "@/lib/hr-payroll"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
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

    const updated = await prisma.$transaction(async (tx) => {
      if (existing.targetType === "PAYROLL_LINE_ITEM") {
        if (!existing.lineItemId || !existing.payrollRunId) {
          throw new Error("Invalid payroll line-item adjustment")
        }
        await tx.payrollLineItem.update({
          where: { id: existing.lineItemId },
          data: { netAmount: { increment: existing.amountDelta } },
        })
        await tx.payrollRun.update({
          where: { id: existing.payrollRunId },
          data: { netTotal: { increment: existing.amountDelta } },
        })
      } else if (existing.targetType === "PAYROLL_RUN") {
        if (!existing.payrollRunId) throw new Error("Invalid payroll-run adjustment")
        await tx.payrollRun.update({
          where: { id: existing.payrollRunId },
          data: { netTotal: { increment: existing.amountDelta } },
        })
      } else if (existing.targetType === "DISBURSEMENT_ITEM") {
        if (!existing.disbursementItemId || !existing.disbursementBatchId) {
          throw new Error("Invalid disbursement-item adjustment")
        }
        await tx.disbursementItem.update({
          where: { id: existing.disbursementItemId },
          data: { amount: { increment: existing.amountDelta } },
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
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "payroll",
        sourceAction: "adjustment-approved",
        sourceId: updated.id,
        description: `Adjustment ${updated.id} approved`,
        amount: updated.amountDelta,
        payload: {
          targetType: updated.targetType,
          payrollRunId: updated.payrollRunId,
          disbursementBatchId: updated.disbursementBatchId,
        },
        createdById: session.user.id,
        status: "IGNORED",
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
