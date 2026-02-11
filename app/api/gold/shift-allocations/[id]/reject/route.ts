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
    const note = validated.note?.trim() || "Rejected from notification center"

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to reject gold payout allocations", 403)
    }

    const existing = await prisma.goldShiftAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        workflowStatus: true,
        submittedById: true,
        site: { select: { companyId: true } },
      },
    })

    if (!existing || existing.site.companyId !== session.user.companyId) {
      return errorResponse("Gold payout allocation not found", 404)
    }
    if (existing.workflowStatus !== "SUBMITTED") {
      return errorResponse("Only submitted allocations can be rejected", 400)
    }
    if (!isTwoStepActionAllowed(existing.submittedById, session.user.id)) {
      return errorResponse("Rejection must be performed by a different user than submitter", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const allocation = await tx.goldShiftAllocation.update({
        where: { id },
        data: {
          workflowStatus: "REJECTED",
          approvedById: null,
          approvedAt: null,
        },
        include: {
          site: { select: { name: true, code: true } },
          shiftReport: { select: { id: true, status: true, crewCount: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          expenses: { select: { id: true, type: true, weight: true } },
          workerShares: {
            select: {
              id: true,
              shareWeight: true,
              employee: { select: { id: true, name: true, employeeId: true } },
            },
          },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "GOLD_SHIFT_ALLOCATION",
        entityId: id,
        action: "REJECT",
        actedById: session.user.id,
        fromStatus: "SUBMITTED",
        toStatus: "REJECTED",
        note,
      })

      return allocation
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/shift-allocations/[id]/reject error:", error)
    return errorResponse("Failed to reject gold payout allocation")
  }
}
