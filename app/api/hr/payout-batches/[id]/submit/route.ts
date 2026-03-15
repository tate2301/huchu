import { NextRequest, NextResponse } from "next/server"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import {
  canTransitionStandardWorkflow,
  createApprovalAction,
  ensureApproverRole,
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
      return errorResponse("Insufficient permissions to submit payout batches", 403)
    }

    const existing = await prisma.irregularPayoutBatch.findUnique({
      where: { id },
      select: {
        id: true,
        workflowStatus: true,
        companyId: true,
        _count: { select: { items: true } },
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Irregular payout batch not found", 404)
    }
    if (!canTransitionStandardWorkflow(existing.workflowStatus, "SUBMIT")) {
      return errorResponse("Only draft or rejected batches can be submitted", 400)
    }
    if (existing._count.items === 0) {
      return errorResponse("Cannot submit an empty payout batch", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const batch = await tx.irregularPayoutBatch.update({
        where: { id },
        data: {
          workflowStatus: "SUBMITTED",
          submittedById: session.user.id,
          submittedAt: new Date(),
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
        action: "SUBMIT",
        actedById: session.user.id,
        fromStatus: existing.workflowStatus,
        toStatus: "SUBMITTED",
      })

      return batch
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/hr/payout-batches/[id]/submit error:", error)
    return errorResponse("Failed to submit payout batch")
  }
}
