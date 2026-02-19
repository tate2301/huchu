import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const updateScheduleSchema = z.object({
  siteId: z.string().uuid().optional(),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  shift: z.enum(["DAY", "NIGHT"]).optional(),
  shiftGroupId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
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

    const schedule = await prisma.shiftGroupSchedule.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, code: true } },
        shiftGroup: {
          select: {
            id: true,
            name: true,
            code: true,
            leader: { select: { id: true, name: true, employeeId: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
    })
    if (!schedule || schedule.companyId !== session.user.companyId) {
      return errorResponse("Shift group schedule not found", 404)
    }

    return successResponse(schedule)
  } catch (error) {
    console.error("[API] GET /api/hr/shift-group-schedules/[id] error:", error)
    return errorResponse("Failed to fetch shift group schedule")
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
      return errorResponse("Insufficient permissions to update shift group schedules", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateScheduleSchema.parse(body)

    const existing = await prisma.shiftGroupSchedule.findUnique({
      where: { id },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Shift group schedule not found", 404)
    }

    const nextSiteId = validated.siteId ?? existing.siteId
    const nextDate = validated.date ? new Date(validated.date) : existing.date
    const nextShift = validated.shift ?? existing.shift
    const nextGroupId = validated.shiftGroupId ?? existing.shiftGroupId

    const [site, group] = await Promise.all([
      prisma.site.findUnique({
        where: { id: nextSiteId },
        select: { id: true, companyId: true, isActive: true },
      }),
      prisma.shiftGroup.findUnique({
        where: { id: nextGroupId },
        select: { id: true, companyId: true, siteId: true, isActive: true },
      }),
    ])

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403)
    }
    if (!site.isActive) {
      return errorResponse("Site is not active", 400)
    }
    if (!group || group.companyId !== session.user.companyId) {
      return errorResponse("Invalid shift group", 403)
    }
    if (!group.isActive) {
      return errorResponse("Shift group is not active", 400)
    }
    if (group.siteId !== nextSiteId) {
      return errorResponse("Shift group does not belong to the selected site", 400)
    }

    const conflicting = await prisma.shiftGroupSchedule.findFirst({
      where: {
        id: { not: id },
        siteId: nextSiteId,
        date: nextDate,
        shift: nextShift,
      },
      select: { id: true },
    })
    if (conflicting) {
      return errorResponse("A shift group is already scheduled for this site/date/shift", 409)
    }

    const updated = await prisma.shiftGroupSchedule.update({
      where: { id },
      data: {
        siteId: validated.siteId,
        date: validated.date ? new Date(validated.date) : undefined,
        shift: validated.shift,
        shiftGroupId: validated.shiftGroupId,
        notes: validated.notes === null ? null : validated.notes,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        shiftGroup: {
          select: {
            id: true,
            name: true,
            code: true,
            leader: { select: { id: true, name: true, employeeId: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/hr/shift-group-schedules/[id] error:", error)
    return errorResponse("Failed to update shift group schedule")
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
      return errorResponse("Insufficient permissions to delete shift group schedules", 403)
    }

    const { id } = await params
    const existing = await prisma.shiftGroupSchedule.findUnique({
      where: { id },
      select: { companyId: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Shift group schedule not found", 404)
    }

    await prisma.shiftGroupSchedule.delete({ where: { id } })
    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/hr/shift-group-schedules/[id] error:", error)
    return errorResponse("Failed to delete shift group schedule")
  }
}

