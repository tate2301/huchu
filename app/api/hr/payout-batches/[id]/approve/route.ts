import { NextRequest, NextResponse } from "next/server"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import {
  canTransitionStandardWorkflow,
  createApprovalAction,
  ensureApproverRole,
  isTwoStepActionAllowed,
} from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

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
      return errorResponse("Insufficient permissions to approve payout batches", 403)
    }

    const existing = await prisma.irregularPayoutBatch.findUnique({
      where: { id },
      select: {
        id: true,
        workflowStatus: true,
        submittedById: true,
        companyId: true,
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Irregular payout batch not found", 404)
    }
    if (!canTransitionStandardWorkflow(existing.workflowStatus, "APPROVE")) {
      return errorResponse("Payout batch must be submitted first", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const batch = await tx.irregularPayoutBatch.update({
        where: { id },
        data: {
          workflowStatus: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          items: {
            include: { employee: { select: { id: true, employeeId: true, name: true } } },
            orderBy: { employee: { name: "asc" } },
          },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "IRREGULAR_PAYOUT_BATCH",
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
    console.error("[API] POST /api/hr/payout-batches/[id]/approve error:", error)
    return errorResponse("Failed to approve payout batch")
  }
}
