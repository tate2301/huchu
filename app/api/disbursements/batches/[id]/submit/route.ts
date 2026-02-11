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
      return errorResponse("Insufficient permissions to submit disbursement batches", 403)
    }

    const existing = await prisma.disbursementBatch.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disbursement batch not found", 404)
    }
    if (existing.status !== "DRAFT") {
      return errorResponse("Only draft batches can be submitted", 400)
    }

    const [itemCount, pendingAdjustments] = await Promise.all([
      prisma.disbursementItem.count({ where: { batchId: id } }),
      prisma.adjustmentEntry.count({
        where: {
          disbursementBatchId: id,
          status: { in: ["DRAFT", "SUBMITTED"] },
        },
      }),
    ])
    if (itemCount === 0) {
      return errorResponse("Cannot submit disbursement batch without items", 400)
    }
    if (pendingAdjustments > 0) {
      return errorResponse("Submit or resolve all pending adjustments before submitting batch", 409)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const batch = await tx.disbursementBatch.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedById: session.user.id,
          submittedAt: new Date(),
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "DISBURSEMENT_BATCH",
        entityId: id,
        action: "SUBMIT",
        actedById: session.user.id,
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
      })

      return batch
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/disbursements/batches/[id]/submit error:", error)
    return errorResponse("Failed to submit disbursement batch")
  }
}
