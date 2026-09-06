import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions"
import { prisma } from "@corelithzw/db/client"
import { canTransitionStandardWorkflow, createApprovalAction, ensureApproverRole, isTwoStepActionAllowed } from "@corelithzw/module-workflow/approvals"
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.compensation", "approve")
    if (denial) return errorResponse(denial, 403)
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to approve compensation rules", 403)
    }

    const existing = await prisma.compensationRule.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        workflowStatus: true,
        submittedById: true,
      },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Compensation rule not found", 404)
    }
    if (!canTransitionStandardWorkflow(existing.workflowStatus, "APPROVE")) {
      return errorResponse("Rule must be submitted before approval", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rule = await tx.compensationRule.update({
        where: { id },
        data: {
          workflowStatus: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          grade: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "COMPENSATION_RULE",
        entityId: id,
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
      })

      return rule
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/compensation/rules/[id]/approve error:", error)
    return errorResponse("Failed to approve compensation rule")
  }
}
