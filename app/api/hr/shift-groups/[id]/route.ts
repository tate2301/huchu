import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const updateShiftGroupSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().max(40).nullable().optional(),
  siteId: z.string().uuid().optional(),
  leaderEmployeeId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
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

    const group = await prisma.shiftGroup.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, code: true } },
        leader: { select: { id: true, name: true, employeeId: true } },
        members: {
          where: { isActive: true },
          include: {
            employee: { select: { id: true, name: true, employeeId: true, phone: true } },
          },
          orderBy: { employee: { name: "asc" } },
        },
        schedules: {
          orderBy: [{ date: "desc" }, { shift: "asc" }],
          take: 30,
        },
      },
    })

    if (!group || group.companyId !== session.user.companyId) {
      return errorResponse("Shift group not found", 404)
    }

    return successResponse(group)
  } catch (error) {
    console.error("[API] GET /api/hr/shift-groups/[id] error:", error)
    return errorResponse("Failed to fetch shift group")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update shift groups", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateShiftGroupSchema.parse(body)

    const existing = await prisma.shiftGroup.findUnique({
      where: { id },
      include: { members: { where: { isActive: true }, select: { employeeId: true } } },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Shift group not found", 404)
    }

    if (validated.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true, isActive: true },
      })
      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }
      if (!site.isActive) {
        return errorResponse("Site is not active", 400)
      }
    }

    if (validated.leaderEmployeeId) {
      const leader = await prisma.employee.findUnique({
        where: { id: validated.leaderEmployeeId },
        select: { companyId: true, isActive: true },
      })
      if (!leader || leader.companyId !== session.user.companyId || !leader.isActive) {
        return errorResponse("Invalid group leader", 400)
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const group = await tx.shiftGroup.update({
        where: { id },
        data: {
          name: validated.name,
          code: validated.code === null ? null : (validated.code?.trim() || undefined),
          siteId: validated.siteId,
          leaderEmployeeId: validated.leaderEmployeeId,
          isActive: validated.isActive,
        },
      })

      if (validated.leaderEmployeeId) {
        const existingMember = await tx.shiftGroupMember.findUnique({
          where: {
            shiftGroupId_employeeId: {
              shiftGroupId: id,
              employeeId: validated.leaderEmployeeId,
            },
          },
          select: { id: true },
        })

        if (existingMember) {
          await tx.shiftGroupMember.update({
            where: {
              shiftGroupId_employeeId: {
                shiftGroupId: id,
                employeeId: validated.leaderEmployeeId,
              },
            },
            data: { isActive: true, leftAt: null },
          })
        } else {
          await tx.shiftGroupMember.create({
            data: {
              shiftGroupId: id,
              employeeId: validated.leaderEmployeeId,
              isActive: true,
            },
          })
        }
      }

      return tx.shiftGroup.findUnique({
        where: { id: group.id },
        include: {
          site: { select: { id: true, name: true, code: true } },
          leader: { select: { id: true, name: true, employeeId: true } },
          members: {
            where: { isActive: true },
            include: {
              employee: { select: { id: true, name: true, employeeId: true } },
            },
            orderBy: { employee: { name: "asc" } },
          },
          _count: { select: { members: true, schedules: true } },
        },
      })
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/hr/shift-groups/[id] error:", error)
    return errorResponse("Failed to update shift group")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to archive shift groups", 403)
    }

    const { id } = await params
    const existing = await prisma.shiftGroup.findUnique({
      where: { id },
      select: { companyId: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Shift group not found", 404)
    }

    await prisma.shiftGroup.update({
      where: { id },
      data: { isActive: false },
    })

    await prisma.shiftGroupMember.updateMany({
      where: { shiftGroupId: id, isActive: true },
      data: { isActive: false, leftAt: new Date() },
    })

    return successResponse({ success: true, archived: true })
  } catch (error) {
    console.error("[API] DELETE /api/hr/shift-groups/[id] error:", error)
    return errorResponse("Failed to archive shift group")
  }
}

