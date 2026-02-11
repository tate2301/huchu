import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"

const adjustmentSchema = z.object({
  disbursementItemId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  amountDelta: z.number(),
  reason: z.string().trim().min(1).max(1000),
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
    const validated = adjustmentSchema.parse(body)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create adjustments", 403)
    }

    const batch = await prisma.disbursementBatch.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    })
    if (!batch || batch.companyId !== session.user.companyId) {
      return errorResponse("Disbursement batch not found", 404)
    }
    if (batch.status !== "DRAFT") {
      return errorResponse("Adjustments can only be created while batch is in draft", 400)
    }

    if (validated.disbursementItemId) {
      const item = await prisma.disbursementItem.findFirst({
        where: { id: validated.disbursementItemId, batchId: id },
        select: { id: true },
      })
      if (!item) {
        return errorResponse("Invalid disbursement item for this batch", 400)
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.adjustmentEntry.create({
        data: {
          companyId: session.user.companyId,
          targetType: validated.disbursementItemId
            ? "DISBURSEMENT_ITEM"
            : "DISBURSEMENT_BATCH",
          disbursementBatchId: id,
          disbursementItemId: validated.disbursementItemId,
          employeeId: validated.employeeId,
          amountDelta: validated.amountDelta,
          reason: validated.reason,
          status: "DRAFT",
          createdById: session.user.id,
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "ADJUSTMENT_ENTRY",
        entityId: adjustment.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
      })

      return adjustment
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/disbursements/batches/[id]/adjustments error:", error)
    return errorResponse("Failed to create disbursement adjustment")
  }
}
