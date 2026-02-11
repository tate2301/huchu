import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
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
      return errorResponse("Insufficient permissions to approve disbursement batches", 403)
    }

    const existing = await prisma.disbursementBatch.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, submittedById: true, payrollRunId: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disbursement batch not found", 404)
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Batch must be submitted first", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }

    const pendingAdjustments = await prisma.adjustmentEntry.count({
      where: {
        disbursementBatchId: id,
        status: { in: ["DRAFT", "SUBMITTED"] },
      },
    })
    if (pendingAdjustments > 0) {
      return errorResponse("Resolve pending adjustments before approving batch", 409)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const batch = await tx.disbursementBatch.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      })

      await tx.payrollRun.updateMany({
        where: {
          id: existing.payrollRunId,
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
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
      })

      return batch
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/disbursements/batches/[id]/approve error:", error)
    return errorResponse("Failed to approve disbursement batch")
  }
}
