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
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"

const profileSchema = z.object({
  employeeId: z.string().uuid(),
  baseAmount: z.number().min(0),
  currency: z.string().min(1).max(10).optional(),
  effectiveFrom: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  effectiveTo: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  notes: z.string().max(1000).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const employeeId = searchParams.get("employeeId")
    const status = searchParams.get("status")
    const workflowStatus = searchParams.get("workflowStatus")
    const effectiveOn = searchParams.get("effectiveOn")
    const search = searchParams.get("search")?.trim()

    const where: Record<string, unknown> = {
      employee: { companyId: session.user.companyId },
    }
    if (employeeId) where.employeeId = employeeId
    if (status) where.status = status
    if (workflowStatus) where.workflowStatus = workflowStatus
    if (effectiveOn) {
      const date = new Date(effectiveOn)
      where.effectiveFrom = { lte: date }
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gte: date } }]
    }
    if (search) {
      const searchOr = [
        { notes: { contains: search, mode: "insensitive" } },
        { employee: { name: { contains: search, mode: "insensitive" } } },
        { employee: { employeeId: { contains: search, mode: "insensitive" } } },
      ]

      if (Array.isArray(where.OR)) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }]
        delete where.OR
      } else {
        where.OR = searchOr
      }
    }

    const [records, total] = await Promise.all([
      prisma.compensationProfile.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              name: true,
              department: { select: { code: true, name: true } },
              grade: { select: { code: true, name: true } },
            },
          },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ employee: { name: "asc" } }, { effectiveFrom: "desc" }],
        skip,
        take: limit,
      }),
      prisma.compensationProfile.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/compensation/profiles error:", error)
    return errorResponse("Failed to fetch compensation profiles")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create compensation profiles", 403)
    }

    const body = await request.json()
    const validated = profileSchema.parse(body)

    const employee = await prisma.employee.findUnique({
      where: { id: validated.employeeId },
      select: { companyId: true },
    })
    if (!employee || employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee", 403)
    }

    const effectiveFrom = new Date(validated.effectiveFrom)
    const effectiveTo = validated.effectiveTo ? new Date(validated.effectiveTo) : undefined

    const profile = await prisma.$transaction(async (tx) => {
      const created = await tx.compensationProfile.create({
        data: {
          employeeId: validated.employeeId,
          baseAmount: validated.baseAmount,
          currency: validated.currency ?? "USD",
          effectiveFrom,
          effectiveTo,
          status: validated.status ?? "ACTIVE",
          workflowStatus: "DRAFT",
          notes: validated.notes,
          createdById: session.user.id,
        },
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "COMPENSATION_PROFILE",
        entityId: created.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
      })

      return created
    })

    return successResponse(profile, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/compensation/profiles error:", error)
    return errorResponse("Failed to create compensation profile")
  }
}
