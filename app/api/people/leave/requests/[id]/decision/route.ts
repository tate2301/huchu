import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { syncApprovedLeaveToAttendance } from "@/lib/people/leave/attendance-sync"
import { prisma } from "@/lib/prisma"
import { createApprovalAction } from "@/lib/workflow/approvals"

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
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

    const denial = hrPermissionDenial(session, "hr.leave", "approve")
    if (denial) return errorResponse(denial, 403)

    const { id } = await params
    const body = await request.json()
    const validated = decisionSchema.parse(body)

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        leaveType: { select: { id: true, name: true, code: true } },
        employee: { select: { id: true, name: true, employeeId: true } },
      },
    })

    if (!leaveRequest || leaveRequest.companyId !== session.user.companyId) {
      return errorResponse("Leave request not found", 404)
    }

    if (leaveRequest.status !== "SUBMITTED" && leaveRequest.status !== "DRAFT") {
      return errorResponse(
        `Cannot decide on a leave request that is ${leaveRequest.status.toLowerCase()}`,
        400,
      )
    }

    const nextStatus = validated.decision === "APPROVE" ? "APPROVED" : "REJECTED"

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          decidedById: session.user.id,
          decidedAt: new Date(),
          decisionNote: validated.note || null,
        },
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
          coveringEmployee: { select: { id: true, name: true } },
          decidedBy: { select: { id: true, name: true } },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "LEAVE_REQUEST",
        entityId: row.id,
        action: validated.decision,
        actedById: session.user.id,
        toStatus: nextStatus,
        note:
          validated.note ??
          `${validated.decision === "APPROVE" ? "Approved" : "Rejected"} ${leaveRequest.leaveType.name}`,
      })

      if (validated.decision === "APPROVE") {
        await syncApprovedLeaveToAttendance(tx, {
          id: row.id,
          companyId: session.user.companyId,
          employeeId: row.employeeId,
          startDate: row.startDate,
          endDate: row.endDate,
          leaveType: row.leaveType,
        })
      }

      return row
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/people/leave/requests/[id]/decision error:", error)
    return errorResponse("Failed to decide leave request")
  }
}
