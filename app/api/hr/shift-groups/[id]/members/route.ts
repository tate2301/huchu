import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const addMembersSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const active = searchParams.get("active")

    const group = await prisma.shiftGroup.findUnique({
      where: { id },
      select: { id: true, companyId: true, leaderEmployeeId: true },
    })
    if (!group || group.companyId !== session.user.companyId) {
      return errorResponse("Shift group not found", 404)
    }

    const where: Record<string, unknown> = { shiftGroupId: id }
    if (active !== null) where.isActive = active === "true"

    const members = await prisma.shiftGroupMember.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            phone: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { employee: { name: "asc" } }],
    })

    return successResponse({
      data: members,
      leaderEmployeeId: group.leaderEmployeeId,
    })
  } catch (error) {
    console.error("[API] GET /api/hr/shift-groups/[id]/members error:", error)
    return errorResponse("Failed to fetch shift group members")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update shift group members", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = addMembersSchema.parse(body)

    const group = await prisma.shiftGroup.findUnique({
      where: { id },
      select: { id: true, companyId: true, isActive: true },
    })
    if (!group || group.companyId !== session.user.companyId) {
      return errorResponse("Shift group not found", 404)
    }
    if (!group.isActive) {
      return errorResponse("Cannot add members to an inactive shift group", 400)
    }

    const uniqueEmployeeIds = Array.from(new Set(validated.employeeIds))
    const employees = await prisma.employee.findMany({
      where: {
        id: { in: uniqueEmployeeIds },
        companyId: session.user.companyId,
        isActive: true,
      },
      select: { id: true },
    })
    if (employees.length !== uniqueEmployeeIds.length) {
      return errorResponse("One or more selected employees are invalid or inactive", 400)
    }

    const existingMembershipsInOtherGroups = await prisma.shiftGroupMember.findMany({
      where: {
        employeeId: { in: uniqueEmployeeIds },
        shiftGroupId: { not: id },
        isActive: true,
        shiftGroup: { companyId: session.user.companyId },
      },
      include: {
        employee: { select: { id: true, name: true, employeeId: true } },
        shiftGroup: { select: { id: true, name: true } },
      },
    })
    if (existingMembershipsInOtherGroups.length > 0) {
      return errorResponse(
        "One or more employees already belong to another active shift group",
        409,
        existingMembershipsInOtherGroups.map((membership) => ({
          employeeId: membership.employee.id,
          employeeName: membership.employee.name,
          employeeCode: membership.employee.employeeId,
          groupId: membership.shiftGroup.id,
          groupName: membership.shiftGroup.name,
        })),
      )
    }

    await prisma.$transaction(async (tx) => {
      for (const employeeId of uniqueEmployeeIds) {
        const existingMembership = await tx.shiftGroupMember.findUnique({
          where: { shiftGroupId_employeeId: { shiftGroupId: id, employeeId } },
          select: { id: true },
        })
        if (existingMembership) {
          await tx.shiftGroupMember.update({
            where: { shiftGroupId_employeeId: { shiftGroupId: id, employeeId } },
            data: { isActive: true, leftAt: null },
          })
        } else {
          await tx.shiftGroupMember.create({
            data: { shiftGroupId: id, employeeId, isActive: true },
          })
        }
      }
    })

    const members = await prisma.shiftGroupMember.findMany({
      where: { shiftGroupId: id, isActive: true },
      include: {
        employee: {
          select: { id: true, name: true, employeeId: true, phone: true, isActive: true },
        },
      },
      orderBy: { employee: { name: "asc" } },
    })

    return successResponse({ data: members }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/shift-groups/[id]/members error:", error)
    return errorResponse("Failed to add shift group members")
  }
}

