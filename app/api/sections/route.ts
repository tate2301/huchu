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
  /** The short reference a section is called by — `SC-11`. Never derived. */
  code: z.string().trim().min(1).max(40).nullish(),
  siteId: z.string().uuid(),
  /**
   * The department that runs it. Null means the section belongs to its site
   * alone, which is how every row created before this read.
   */
  departmentId: z.string().uuid().nullish(),
  isActive: z.boolean().optional(),
})

const sectionListSelect = {
  id: true,
  name: true,
  code: true,
  siteId: true,
  departmentId: true,
  isActive: true,
  _count: { select: { shiftReports: true } },
  site: { select: { name: true, code: true } },
  department: { select: { id: true, code: true, name: true } },
} as const

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const departmentId = searchParams.get("departmentId")
    const search = searchParams.get("search")?.trim()
    const active = searchParams.get("active")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    }

    if (siteId) where.siteId = siteId
    if (departmentId) where.departmentId = departmentId
    if (active !== null) where.isActive = active === "true"
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ]
    }

    const [sections, total] = await Promise.all([
      prisma.section.findMany({
        where,
        select: sectionListSelect,
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

    if (validated.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: validated.departmentId, companyId: session.user.companyId },
        select: { id: true },
      })
      if (!department) return errorResponse("Invalid department", 403)
    }

    const section = await prisma.section.create({
      data: {
        name: validated.name,
        code: validated.code ?? null,
        siteId: validated.siteId,
        departmentId: validated.departmentId ?? null,
        isActive: validated.isActive ?? true,
      },
      select: sectionListSelect,
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
