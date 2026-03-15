import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import {
  canTransitionStandardWorkflow,
  createApprovalAction,
  ensureApproverRole,
  isTwoStepActionAllowed,
  normalizeWorkflowNote,
} from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const rejectSchema = z.object({
  note: z.string().trim().max(1000).optional(),
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

    let parsedBody: unknown = {}
    try {
      parsedBody = await request.json()
    } catch {
      parsedBody = {}
    }
    const validated = rejectSchema.parse(parsedBody)
    const note = normalizeWorkflowNote(validated.note, "Rejected from payout review")

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to reject payout batches", 403)
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
    if (!canTransitionStandardWorkflow(existing.workflowStatus, "REJECT")) {
      return errorResponse("Only submitted payout batches can be rejected", 400)
    }
    if (!isTwoStepActionAllowed(existing.submittedById, session.user.id)) {
      return errorResponse("Rejection must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const batch = await tx.irregularPayoutBatch.update({
        where: { id },
        data: {
          workflowStatus: "REJECTED",
          approvedById: null,
          approvedAt: null,
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
        action: "REJECT",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "REJECTED",
        note,
      })

      return batch
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/payout-batches/[id]/reject error:", error)
    return errorResponse("Failed to reject payout batch")
  }
}
