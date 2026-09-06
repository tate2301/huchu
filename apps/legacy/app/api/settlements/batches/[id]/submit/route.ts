import { NextRequest, NextResponse } from "next/server"

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils"
import { prisma } from "@corelithzw/db/client"
import { settlementPermissionDenial } from "@/lib/settlements/permissions"
import { createApprovalAction } from "@corelithzw/module-workflow/approvals"

/**
 * A settlement batch's status is `DisbursementBatchStatus`, which has a PAID
 * value the standard four-state workflow does not — so this does not go through
 * `settlementWorkflowRoute`. Paying is `mark-paid`, not an approval step.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = settlementPermissionDenial(session, "settlements.batch", "submit")
    if (denial) return errorResponse(denial, 403)

    const { id } = await params
    const existing = await prisma.settlementBatch.findUnique({
      where: { id },
      select: { id: true, code: true, companyId: true, status: true, submittedById: true },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Settlement batch not found", 404)
    }
    if (existing.status !== "DRAFT") {
      return errorResponse(
        `${existing.code} is ${existing.status.toLowerCase()} and cannot be submitted`,
        400,
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const batch = await tx.settlementBatch.update({
        where: { id },
        data: { status: "SUBMITTED", submittedById: session.user.id, submittedAt: new Date() },
        include: {
          run: { select: { id: true, code: true, source: true } },
          items: {
            include: { employee: { select: { id: true, employeeId: true, name: true } } },
            orderBy: { employee: { name: "asc" } },
          },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "SETTLEMENT_BATCH",
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
    console.error("[API] POST /api/settlements/batches/[id]/submit error:", error)
    return errorResponse("Failed to submit settlement batch")
  }
}
