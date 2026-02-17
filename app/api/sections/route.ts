import { NextRequest, NextResponse } from "next/server"
import {
  hasRole,
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const sectionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  siteId: z.string().uuid(),
  isActive: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const search = searchParams.get("search")?.trim()
    const active = searchParams.get("active")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    }

    if (siteId) where.siteId = siteId
    if (active !== null) where.isActive = active === "true"
    if (search) {
      where.name = { contains: search, mode: "insensitive" }
    }

    const [sections, total] = await Promise.all([
      prisma.section.findMany({
        where,
        select: {
          id: true,
          name: true,
          siteId: true,
          isActive: true,
          _count: { select: { shiftReports: true } },
          site: { select: { name: true, code: true } },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.section.count({ where }),
    ])

    return successResponse(paginationResponse(sections, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/sections error:", error)
    return errorResponse("Failed to fetch sections")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to create sections", 403)
    }

    const body = await request.json()
    const validated = sectionSchema.parse(body)

    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true },
    })
    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403)
    }

    const section = await prisma.section.create({
      data: {
        name: validated.name,
        siteId: validated.siteId,
        isActive: validated.isActive ?? true,
      },
      select: {
        id: true,
        name: true,
        siteId: true,
        isActive: true,
        _count: { select: { shiftReports: true } },
        site: { select: { name: true, code: true } },
      },
    })

    return successResponse(section, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/sections error:", error)
    return errorResponse("Failed to create section")
  }
}
