import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { ensureApproverRole } from "@/lib/workflow/approvals"
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator"
import { departmentInclude, resolveDepartmentPlacement } from "@/lib/hr/departments"

/**
 * Head, cost centre and site are nullable everywhere — in the column, in the
 * payload and here. `.nullish()` rather than `.optional()` is the difference
 * between "leave it alone" and "clear it", and a combobox with a None option
 * needs both.
 */
const departmentSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(200),
  isActive: z.boolean().optional(),
  headEmployeeId: z.string().uuid().nullish(),
  costCenterId: z.string().uuid().nullish(),
  siteId: z.string().uuid().nullish(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)

    const search = searchParams.get("search")?.trim()
    const active = searchParams.get("active")

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (active !== null) where.isActive = active === "true"
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ]
    }

    const [records, total] = await Promise.all([
      prisma.department.findMany({
        where,
        // The register renders the selected row as the record rather than
        // fetching it again, so the list carries the whole placement.
        include: departmentInclude,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.department.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/departments error:", error)
    return errorResponse("Failed to fetch departments")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create departments", 403)
    }

    const body = await request.json()
    const validated = departmentSchema.parse(body)
    const code = validated.code
      ? normalizeProvidedId(validated.code, "DEPARTMENT")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "DEPARTMENT",
        })

    const placement = await resolveDepartmentPlacement(session.user.companyId, {
      ...(validated.headEmployeeId === undefined
        ? {}
        : { headEmployeeId: validated.headEmployeeId }),
      ...(validated.costCenterId === undefined
        ? {}
        : { costCenterId: validated.costCenterId }),
      ...(validated.siteId === undefined ? {} : { siteId: validated.siteId }),
    })
    if (!placement.ok) return errorResponse(placement.error, 400)

    const department = await prisma.department.create({
      data: {
        companyId: session.user.companyId,
        code,
        name: validated.name,
        isActive: validated.isActive ?? true,
        ...placement.data,
      },
      include: departmentInclude,
    })

    return successResponse(department, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/departments error:", error)
    return errorResponse("Failed to create department")
  }
}
