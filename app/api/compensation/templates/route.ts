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

const templateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"]).optional(),
  position: z
    .enum(["MANAGER", "CLERK", "SUPPORT_STAFF", "ENGINEERS", "CHEMIST", "MINERS"])
    .optional(),
  baseAmount: z.number().min(0),
  currency: z.string().trim().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  ruleIds: z.array(z.string().uuid()).max(100).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)

    const search = searchParams.get("search")
    const active = searchParams.get("active")
    const employmentType = searchParams.get("employmentType")
    const position = searchParams.get("position")

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }
    if (search) where.name = { contains: search, mode: "insensitive" }
    if (active !== null) where.isActive = active === "true"
    if (employmentType) where.employmentType = employmentType
    if (position) where.position = position

    const [records, total] = await Promise.all([
      prisma.compensationTemplate.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          rules: {
            include: {
              compensationRule: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  calcMethod: true,
                  value: true,
                  cap: true,
                  taxable: true,
                  currency: true,
                  isActive: true,
                  workflowStatus: true,
                },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { compensationRule: { name: "asc" } }],
          },
          _count: { select: { rules: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.compensationTemplate.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/compensation/templates error:", error)
    return errorResponse("Failed to fetch compensation templates")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create compensation templates", 403)
    }

    const body = await request.json()
    const validated = templateSchema.parse(body)
    const ruleIds = Array.from(new Set(validated.ruleIds ?? []))

    if (ruleIds.length > 0) {
      const matched = await prisma.compensationRule.count({
        where: {
          id: { in: ruleIds },
          companyId: session.user.companyId,
          workflowStatus: "APPROVED",
          isActive: true,
        },
      })
      if (matched !== ruleIds.length) {
        return errorResponse(
          "One or more selected rules are missing, inactive, or not approved",
          400,
        )
      }
    }

    const created = await prisma.compensationTemplate.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name,
        description: validated.description,
        employmentType: validated.employmentType,
        position: validated.position,
        baseAmount: validated.baseAmount,
        currency: validated.currency ?? "USD",
        isActive: validated.isActive ?? true,
        createdById: session.user.id,
        rules: {
          create: ruleIds.map((ruleId, index) => ({
            compensationRuleId: ruleId,
            sortOrder: index,
          })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        rules: {
          include: {
            compensationRule: {
              select: {
                id: true,
                name: true,
                type: true,
                calcMethod: true,
                value: true,
                cap: true,
                taxable: true,
                currency: true,
                isActive: true,
                workflowStatus: true,
              },
            },
          },
          orderBy: [{ sortOrder: "asc" }, { compensationRule: { name: "asc" } }],
        },
        _count: { select: { rules: true } },
      },
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/compensation/templates error:", error)
    return errorResponse("Failed to create compensation template")
  }
}
