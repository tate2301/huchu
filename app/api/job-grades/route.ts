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
import { ensureApproverRole } from "@/lib/hr-payroll"

const gradeSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  rank: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
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
      prisma.jobGrade.findMany({
        where,
        include: {
          _count: { select: { employees: true } },
        },
        orderBy: [{ rank: "asc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.jobGrade.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/job-grades error:", error)
    return errorResponse("Failed to fetch job grades")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create job grades", 403)
    }

    const body = await request.json()
    const validated = gradeSchema.parse(body)

    const grade = await prisma.jobGrade.create({
      data: {
        companyId: session.user.companyId,
        code: validated.code.toUpperCase(),
        name: validated.name,
        rank: validated.rank ?? 0,
        isActive: validated.isActive ?? true,
      },
    })

    return successResponse(grade, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/job-grades error:", error)
    return errorResponse("Failed to create job grade")
  }
}
