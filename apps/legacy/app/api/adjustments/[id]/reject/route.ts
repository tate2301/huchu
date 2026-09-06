import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { prisma } from "@corelithzw/db/client"
import { createApprovalAction, ensureApproverRole, isTwoStepActionAllowed } from "@corelithzw/module-workflow/approvals"
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
    const denial = hrPermissionDenial(session, "hr.payroll", "approve")
    if (denial) return errorResponse(denial, 403)
    const { id } = await params
    const body = await request.json()
    const validated = rejectSchema.parse(body)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to reject adjustments", 403)
    }

    const existing = await prisma.adjustmentEntry.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, submittedById: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Adjustment not found", 404)
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Only submitted adjustments can be rejected", 400)
    }
    if (!isTwoStepActionAllowed(existing.submittedById, session.user.id)) {
      return errorResponse("Rejection must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.adjustmentEntry.update({
        where: { id },
        data: {
          status: "REJECTED",
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "ADJUSTMENT_ENTRY",
        entityId: adjustment.id,
        action: "REJECT",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "REJECTED",
        note: validated.note,
      })

      return adjustment
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/adjustments/[id]/reject error:", error)
    return errorResponse("Failed to reject adjustment")
  }
}
