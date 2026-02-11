import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"

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
      return errorResponse("Insufficient permissions to submit compensation profiles", 403)
    }

    const existing = await prisma.compensationProfile.findUnique({
      where: { id },
      include: { employee: { select: { companyId: true } } },
    })
    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Compensation profile not found", 404)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.workflowStatus)) {
      return errorResponse("Only draft or rejected profiles can be submitted", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const profile = await tx.compensationProfile.update({
        where: { id },
        data: {
          workflowStatus: "SUBMITTED",
          submittedById: session.user.id,
          submittedAt: new Date(),
          approvedById: null,
          approvedAt: null,
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
        action: "SUBMIT",
        actedById: session.user.id,
        fromStatus: existing.workflowStatus,
        toStatus: "SUBMITTED",
      })

      return profile
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/compensation/profiles/[id]/submit error:", error)
    return errorResponse("Failed to submit compensation profile")
  }
}
