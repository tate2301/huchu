import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"
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
      return errorResponse("Insufficient permissions to submit gold payout allocations", 403)
    }

    const existing = await prisma.goldShiftAllocation.findUnique({
      where: { id },
      select: {
        id: true,
        workflowStatus: true,
        site: { select: { companyId: true } },
        _count: { select: { workerShares: true } },
      },
    })

    if (!existing || existing.site.companyId !== session.user.companyId) {
      return errorResponse("Gold payout allocation not found", 404)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.workflowStatus)) {
      return errorResponse("Only draft or rejected allocations can be submitted", 400)
    }
    if (existing._count.workerShares === 0) {
      return errorResponse("Cannot submit allocation without worker shares", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const allocation = await tx.goldShiftAllocation.update({
        where: { id },
        data: {
          workflowStatus: "SUBMITTED",
          submittedById: session.user.id,
          submittedAt: new Date(),
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
        action: "SUBMIT",
        actedById: session.user.id,
        fromStatus: existing.workflowStatus,
        toStatus: "SUBMITTED",
      })

      return allocation
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/gold/shift-allocations/[id]/submit error:", error)
    return errorResponse("Failed to submit gold payout allocation")
  }
}
