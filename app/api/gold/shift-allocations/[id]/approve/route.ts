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
      return errorResponse("Insufficient permissions to approve gold payout allocations", 403)
    }

    const existing = await prisma.goldShiftAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        workflowStatus: true,
        submittedById: true,
        site: { select: { companyId: true } },
      },
    })

    if (!existing || existing.site.companyId !== session.user.companyId) {
      return errorResponse("Gold payout allocation not found", 404)
    }
    if (!canTransitionStandardWorkflow(existing.workflowStatus, "APPROVE")) {
      return errorResponse("Allocation must be submitted first", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const allocation = await tx.goldShiftAllocation.update({
        where: { id },
        data: {
          workflowStatus: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
        include: {
          site: { select: { name: true, code: true } },
          shiftReport: { select: { id: true, status: true, crewCount: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          expenses: { select: { id: true, type: true, weight: true } },
          workerShares: {
            select: {
              id: true,
              shareWeight: true,
              employee: { select: { id: true, name: true, employeeId: true } },
            },
          },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "GOLD_SHIFT_ALLOCATION",
        entityId: id,
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
      })

      return allocation
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/gold/shift-allocations/[id]/approve error:", error)
    return errorResponse("Failed to approve gold payout allocation")
  }
}
