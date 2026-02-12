import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import {
  canTransitionStandardWorkflow,
  createApprovalAction,
  ensureApproverRole,
  isTwoStepActionAllowed,
} from "@/lib/hr-payroll"

const rejectSchema = z.object({
  note: z.string().trim().min(1).max(1000),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params
    const body = await request.json()
    const validated = rejectSchema.parse(body)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to reject compensation rules", 403)
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
    if (!canTransitionStandardWorkflow(existing.workflowStatus, "REJECT")) {
      return errorResponse("Only submitted rules can be rejected", 400)
    }
    if (!isTwoStepActionAllowed(existing.submittedById, session.user.id)) {
      return errorResponse("Rejection must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rule = await tx.compensationRule.update({
        where: { id },
        data: {
          workflowStatus: "REJECTED",
          approvedById: null,
          approvedAt: null,
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
        action: "REJECT",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "REJECTED",
        note: validated.note,
      })

      return rule
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/compensation/rules/[id]/reject error:", error)
    return errorResponse("Failed to reject compensation rule")
  }
}
