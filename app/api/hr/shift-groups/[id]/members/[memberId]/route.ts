import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const updateMembershipSchema = z.object({
  isActive: z.boolean(),
})

async function resolveMembershipContext(
  groupId: string,
  memberId: string,
  companyId: string,
) {
  const membership = await prisma.shiftGroupMember.findUnique({
    where: { id: memberId },
    include: {
      shiftGroup: {
        select: { id: true, companyId: true, leaderEmployeeId: true },
      },
      employee: { select: { id: true, name: true, employeeId: true } },
    },
  })

  if (!membership || membership.shiftGroupId !== groupId) {
    return { error: errorResponse("Shift group member not found", 404) as NextResponse }
  }
  if (membership.shiftGroup.companyId !== companyId) {
    return { error: errorResponse("Forbidden", 403) as NextResponse }
  }

  return { membership }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update shift group members", 403)
    }

    const { id, memberId } = await params
    const body = await request.json()
    const validated = updateMembershipSchema.parse(body)

    const context = await resolveMembershipContext(id, memberId, session.user.companyId)
    if ("error" in context) return context.error
    const { membership } = context

    if (!validated.isActive && membership.employeeId === membership.shiftGroup.leaderEmployeeId) {
      return errorResponse("Cannot deactivate the current group leader from members", 400)
    }

    const updated = await prisma.shiftGroupMember.update({
      where: { id: memberId },
      data: {
        isActive: validated.isActive,
        leftAt: validated.isActive ? null : new Date(),
      },
      include: {
        employee: {
          select: { id: true, name: true, employeeId: true, phone: true, isActive: true },
        },
      },
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/hr/shift-groups/[id]/members/[memberId] error:", error)
    return errorResponse("Failed to update shift group member")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update shift group members", 403)
    }

    const { id, memberId } = await params
    const context = await resolveMembershipContext(id, memberId, session.user.companyId)
    if ("error" in context) return context.error
    const { membership } = context

    if (membership.employeeId === membership.shiftGroup.leaderEmployeeId) {
      return errorResponse("Cannot remove the current group leader from members", 400)
    }

    await prisma.shiftGroupMember.update({
      where: { id: memberId },
      data: { isActive: false, leftAt: new Date() },
    })

    return successResponse({ success: true, removed: true })
  } catch (error) {
    console.error("[API] DELETE /api/hr/shift-groups/[id]/members/[memberId] error:", error)
    return errorResponse("Failed to remove shift group member")
  }
}

