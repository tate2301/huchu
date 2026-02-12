import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import {
  createApprovalAction,
  ensureApproverRole,
  isTwoStepActionAllowed,
} from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

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
      return errorResponse("Insufficient permissions to reject disciplinary actions", 403)
    }

    const existing = await prisma.disciplinaryAction.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        submittedById: true,
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disciplinary action not found", 404)
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Only submitted disciplinary actions can be rejected", 400)
    }
    if (
      !isTwoStepActionAllowed(existing.submittedById, session.user.id, session.user.role, {
        allowSuperadminSelfAction: true,
      })
    ) {
      return errorResponse("Rejection must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const action = await tx.disciplinaryAction.update({
        where: { id },
        data: {
          status: "REJECTED",
          approvedById: null,
          approvedAt: null,
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
        action: "REJECT",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "REJECTED",
        note: validated.note,
      })

      return action
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/disciplinary-actions/[id]/reject error:", error)
    return errorResponse("Failed to reject disciplinary action")
  }
}
