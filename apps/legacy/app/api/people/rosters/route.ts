import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@corelithzw/db"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils"
import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions"
import { ensureApproverRole } from "@corelithzw/module-workflow/approvals"
import { prisma } from "@corelithzw/db/client"

const createShiftGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional(),
  /// Optional. A workforce without sites still has crews — see the note on the
  /// model. A mine sends one; a bureau does not.
  siteId: z.string().uuid().nullable().optional(),
  leaderEmployeeId: z.string().uuid(),
  memberIds: z.array(z.string().uuid()).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.employees", "view")
    if (denial) return errorResponse(denial, 403)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim()
    const siteId = searchParams.get("siteId")
    const active = searchParams.get("active")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (siteId) where.siteId = siteId
    if (active !== null) where.isActive = active === "true"
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { leader: { name: { contains: search, mode: "insensitive" } } },
        { leader: { employeeId: { contains: search, mode: "insensitive" } } },
        { site: { name: { contains: search, mode: "insensitive" } } },
        { site: { code: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [groups, total] = await Promise.all([
      prisma.shiftGroup.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
          leader: { select: { id: true, name: true, employeeId: true } },
          _count: { select: { members: true, schedules: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.shiftGroup.count({ where }),
    ])

    return successResponse(paginationResponse(groups, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/people/rosters error:", error)
    return errorResponse("Failed to fetch shift groups")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.employees", "create")
    if (denial) return errorResponse(denial, 403)

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create shift groups", 403)
    }

    const body = await request.json()
    const validated = createShiftGroupSchema.parse(body)

    const [site, leader] = await Promise.all([
      // Only looked up when one was named. A group with no site is valid; a group
      // naming a site that is not this company's is not.
      validated.siteId
        ? prisma.site.findUnique({
            where: { id: validated.siteId },
            select: { id: true, companyId: true, isActive: true },
          })
        : Promise.resolve(null),
      prisma.employee.findUnique({
        where: { id: validated.leaderEmployeeId },
        select: { id: true, companyId: true, isActive: true },
      }),
    ])

    if (validated.siteId) {
      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }
      if (!site.isActive) {
        return errorResponse("Site is not active", 400)
      }
    }
    if (!leader || leader.companyId !== session.user.companyId || !leader.isActive) {
      return errorResponse("Invalid group leader", 400)
    }

    const requestedMemberIds = new Set(validated.memberIds ?? [])
    requestedMemberIds.add(validated.leaderEmployeeId)
    const memberIds = Array.from(requestedMemberIds)

    if (memberIds.length > 0) {
      const employees = await prisma.employee.findMany({
        where: {
          id: { in: memberIds },
          companyId: session.user.companyId,
          isActive: true,
        },
        select: { id: true },
      })
      if (employees.length !== memberIds.length) {
        return errorResponse("One or more selected members are invalid or inactive", 400)
      }

    }

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.shiftGroup.create({
        data: {
          companyId: session.user.companyId,
          siteId: validated.siteId ?? null,
          name: validated.name,
          code: validated.code?.trim() || undefined,
          leaderEmployeeId: validated.leaderEmployeeId,
        },
      })

      if (memberIds.length > 0) {
        await tx.shiftGroupMember.createMany({
          data: memberIds.map((employeeId) => ({
            shiftGroupId: group.id,
            employeeId,
            isActive: true,
          })),
        })
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

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",")
        : ""
      if (target.includes("companyId") && target.includes("name")) {
        return errorResponse("Shift group name already exists", 409)
      }
      return errorResponse("Shift group data conflicts with an existing record", 409)
    }
    console.error("[API] POST /api/people/rosters error:", error)
    return errorResponse("Failed to create shift group")
  }
}
