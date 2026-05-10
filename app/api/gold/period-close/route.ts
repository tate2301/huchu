import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
  hasRole,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const periodCloseSchema = z.object({
  siteId: z.string().uuid().optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
})

function toMidnightUTC(raw: string): Date {
  const d = new Date(raw)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function isMidnightUTC(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId") ?? undefined
    const { page, limit, skip } = getPaginationParams(request)

    const where = {
      companyId: session.user.companyId,
      ...(siteId ? { siteId } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.goldPeriodClose.findMany({
        where,
        include: {
          closedBy: { select: { id: true, name: true, email: true } },
          overrideBy: { select: { id: true, name: true, email: true } },
          site: { select: { id: true, name: true, code: true } },
        },
        orderBy: { periodStart: "desc" },
        skip,
        take: limit,
      }),
      prisma.goldPeriodClose.count({ where }),
    ])

    return successResponse(paginationResponse(rows, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/gold/period-close error:", error)
    return errorResponse("Failed to fetch closed periods")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["MANAGER", "SUPERADMIN"])) {
      return errorResponse("Manager-level access required to close a period", 403)
    }

    const body = await request.json()
    const validated = periodCloseSchema.parse(body)

    const periodStart = toMidnightUTC(validated.periodStart)
    const periodEnd = toMidnightUTC(validated.periodEnd)

    if (!isMidnightUTC(periodStart) || !isMidnightUTC(periodEnd)) {
      return errorResponse("periodStart and periodEnd must be UTC midnight-aligned", 400)
    }

    if (periodEnd <= periodStart) {
      return errorResponse("periodEnd must be after periodStart", 400)
    }

    if (validated.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true },
      })
      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }
    }

    const existing = await prisma.goldPeriodClose.findFirst({
      where: {
        companyId: session.user.companyId,
        siteId: validated.siteId ?? null,
        periodStart,
      },
    })
    if (existing) {
      return errorResponse("A period close already exists for this company/site/periodStart", 409)
    }

    const row = await prisma.goldPeriodClose.create({
      data: {
        companyId: session.user.companyId,
        siteId: validated.siteId ?? null,
        periodStart,
        periodEnd,
        closedById: session.user.id,
      },
      include: {
        closedBy: { select: { id: true, name: true, email: true } },
        overrideBy: { select: { id: true, name: true, email: true } },
        site: { select: { id: true, name: true, code: true } },
      },
    })

    return successResponse(row, 201)
  } catch (error) {
    console.error("[API] POST /api/gold/period-close error:", error)
    return errorResponse("Failed to close period")
  }
}
