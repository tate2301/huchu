import { NextRequest, NextResponse } from "next/server"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import {
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
      return errorResponse("Insufficient permissions to approve disciplinary actions", 403)
    }

    const existing = await prisma.disciplinaryAction.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        submittedById: true,
        penaltyAmount: true,
        penaltyStatus: true,
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disciplinary action not found", 404)
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Disciplinary action must be submitted before approval", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Approval must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const action = await tx.disciplinaryAction.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
          penaltyStatus:
            existing.penaltyAmount > 0 && existing.penaltyStatus === "NONE"
              ? "PENDING"
              : existing.penaltyStatus,
        },
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          incident: {
            select: {
              id: true,
              title: true,
              category: true,
              severity: true,
              status: true,
              incidentDate: true,
            },
          },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          appliedBy: { select: { id: true, name: true } },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "DISCIPLINARY_ACTION",
        entityId: id,
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "APPROVED",
      })

      return action
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/hr/disciplinary-actions/[id]/approve error:", error)
    return errorResponse("Failed to approve disciplinary action")
  }
}
