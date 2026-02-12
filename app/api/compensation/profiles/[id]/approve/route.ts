import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import {
  canTransitionStandardWorkflow,
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
      return errorResponse("Insufficient permissions to approve compensation profiles", 403)
    }

    const existing = await prisma.compensationProfile.findUnique({
      where: { id },
      include: { employee: { select: { companyId: true } } },
    })
    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Compensation profile not found", 404)
    }
    if (!canTransitionStandardWorkflow(existing.workflowStatus, "APPROVE")) {
      return errorResponse("Profile must be submitted before approval", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (existing.status === "ACTIVE") {
        await tx.compensationProfile.updateMany({
          where: {
            employeeId: existing.employeeId,
            id: { not: id },
            status: "ACTIVE",
            workflowStatus: "APPROVED",
          },
          data: {
            status: "INACTIVE",
            effectiveTo: existing.effectiveFrom,
          },
        })
      }

      const profile = await tx.compensationProfile.update({
        where: { id },
        data: {
          workflowStatus: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "COMPENSATION_PROFILE",
        entityId: id,
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
      })

      return profile
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/compensation/profiles/[id]/approve error:", error)
    return errorResponse("Failed to approve compensation profile")
  }
}
