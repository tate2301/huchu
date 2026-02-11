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
      return errorResponse("Insufficient permissions to submit adjustments", 403)
    }

    const existing = await prisma.adjustmentEntry.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        payrollRun: { select: { status: true } },
        disbursementBatch: { select: { status: true } },
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Adjustment not found", 404)
    }
    if (existing.status !== "DRAFT") {
      return errorResponse("Only draft adjustments can be submitted", 400)
    }
    if (existing.payrollRun && existing.payrollRun.status !== "DRAFT") {
      return errorResponse("Payroll run must be in draft before submitting adjustment", 409)
    }
    if (existing.disbursementBatch && existing.disbursementBatch.status !== "DRAFT") {
      return errorResponse("Disbursement batch must be in draft before submitting adjustment", 409)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.adjustmentEntry.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedById: session.user.id,
          submittedAt: new Date(),
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "ADJUSTMENT_ENTRY",
        entityId: adjustment.id,
        action: "SUBMIT",
        actedById: session.user.id,
        fromStatus: "DRAFT",
        toStatus: "SUBMITTED",
      })

      return adjustment
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/adjustments/[id]/submit error:", error)
    return errorResponse("Failed to submit adjustment")
  }
}
