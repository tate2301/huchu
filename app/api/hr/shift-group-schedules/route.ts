import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

function normalizeShiftLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}

const shiftLabelSchema = z
  .string()
  .trim()
  .min(1, "Shift is required")
  .max(50, "Shift must be 50 characters or less")
  .transform(normalizeShiftLabel)

function getDayRange(dateValue: string) {
  const start = new Date(dateValue)
  const end = new Date(dateValue)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

const createScheduleSchema = z.object({
  siteId: z.string().uuid(),
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  shift: shiftLabelSchema,
  shiftGroupId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const shift = searchParams.get("shift")
    const shiftGroupId = searchParams.get("shiftGroupId")
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const search = searchParams.get("search")?.trim()
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (siteId) where.siteId = siteId
    if (shiftGroupId) where.shiftGroupId = shiftGroupId
    if (shift?.trim()) where.shift = normalizeShiftLabel(shift)

    if (date) {
      const start = new Date(date)
      const end = new Date(date)
      end.setDate(end.getDate() + 1)
      where.date = { gte: start, lt: end }
    } else if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.date = dateFilter
    }

    if (search) {
      where.OR = [
        { notes: { contains: search, mode: "insensitive" } },
        { shift: { contains: search, mode: "insensitive" } },
        { site: { name: { contains: search, mode: "insensitive" } } },
        { site: { code: { contains: search, mode: "insensitive" } } },
        { shiftGroup: { name: { contains: search, mode: "insensitive" } } },
        { shiftGroup: { code: { contains: search, mode: "insensitive" } } },
        { shiftGroup: { leader: { name: { contains: search, mode: "insensitive" } } } },
      ]
    }

    const [schedules, total] = await Promise.all([
      prisma.shiftGroupSchedule.findMany({
        where,
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
        orderBy: [{ date: "desc" }, { shift: "asc" }],
        skip,
        take: limit,
      }),
      prisma.shiftGroupSchedule.count({ where }),
    ])

    return successResponse(paginationResponse(schedules, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/hr/shift-group-schedules error:", error)
    return errorResponse("Failed to fetch shift group schedules")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create shift group schedules", 403)
    }

    const body = await request.json()
    const validated = createScheduleSchema.parse(body)

    const [site, group] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { id: true, companyId: true, isActive: true },
      }),
      prisma.shiftGroup.findUnique({
        where: { id: validated.shiftGroupId },
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
    if (group.siteId !== validated.siteId) {
      return errorResponse("Shift group does not belong to the selected site", 400)
    }

    const { start: scheduleDate, end: scheduleDateEnd } = getDayRange(validated.date)
    const existing = await prisma.shiftGroupSchedule.findFirst({
      where: {
        shiftGroupId: validated.shiftGroupId,
        date: { gte: scheduleDate, lt: scheduleDateEnd },
      },
      select: { id: true },
    })
    if (existing) {
      return errorResponse("This shift group already has a shift scheduled for this date", 409)
    }

    const created = await prisma.shiftGroupSchedule.create({
      data: {
        companyId: session.user.companyId,
        siteId: validated.siteId,
        date: scheduleDate,
        shift: validated.shift,
        shiftGroupId: validated.shiftGroupId,
        notes: validated.notes,
        createdById: session.user.id,
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

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/shift-group-schedules error:", error)
    return errorResponse("Failed to create shift group schedule")
  }
}
