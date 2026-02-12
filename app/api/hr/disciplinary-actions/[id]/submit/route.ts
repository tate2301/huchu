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
      return errorResponse("Insufficient permissions to submit disciplinary actions", 403)
    }

    const existing = await prisma.disciplinaryAction.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        penaltyAmount: true,
        penaltyStatus: true,
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disciplinary action not found", 404)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.status)) {
      return errorResponse("Only draft or rejected disciplinary actions can be submitted", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const action = await tx.disciplinaryAction.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedById: session.user.id,
          submittedAt: new Date(),
          approvedById: null,
          approvedAt: null,
          appliedById: null,
          appliedAt: null,
          penaltyStatus:
            existing.penaltyAmount > 0 && existing.penaltyStatus === "NONE"
              ? "PENDING"
              : existing.penaltyStatus,
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
        action: "SUBMIT",
        actedById: session.user.id,
        fromStatus: existing.status,
        toStatus: "SUBMITTED",
      })

      return action
    })

    return successResponse(updated)
  } catch (error) {
    console.error("[API] POST /api/hr/disciplinary-actions/[id]/submit error:", error)
    return errorResponse("Failed to submit disciplinary action")
  }
}
