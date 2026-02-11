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

const ruleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(["ALLOWANCE", "DEDUCTION"]),
  calcMethod: z.enum(["FIXED", "PERCENT"]),
  value: z.number().min(0),
  cap: z.number().min(0).optional(),
  taxable: z.boolean().optional(),
  currency: z.string().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  gradeId: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)
    const search = searchParams.get("search")
    const type = searchParams.get("type")
    const active = searchParams.get("active")
    const workflowStatus = searchParams.get("workflowStatus")
    const employeeId = searchParams.get("employeeId")
    const departmentId = searchParams.get("departmentId")
    const gradeId = searchParams.get("gradeId")

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (search) where.name = { contains: search, mode: "insensitive" }
    if (type) where.type = type
    if (active !== null) where.isActive = active === "true"
    if (workflowStatus) where.workflowStatus = workflowStatus
    if (employeeId) where.employeeId = employeeId
    if (departmentId) where.departmentId = departmentId
    if (gradeId) where.gradeId = gradeId

    const [records, total] = await Promise.all([
      prisma.compensationRule.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          grade: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.compensationRule.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/compensation/rules error:", error)
    return errorResponse("Failed to fetch compensation rules")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create compensation rules", 403)
    }

    const body = await request.json()
    const validated = ruleSchema.parse(body)

    const [employee, department, grade] = await Promise.all([
      validated.employeeId
        ? prisma.employee.findUnique({
            where: { id: validated.employeeId },
            select: { companyId: true },
          })
        : Promise.resolve(null),
      validated.departmentId
        ? prisma.department.findUnique({
            where: { id: validated.departmentId },
            select: { companyId: true },
          })
        : Promise.resolve(null),
      validated.gradeId
        ? prisma.jobGrade.findUnique({
            where: { id: validated.gradeId },
            select: { companyId: true },
          })
        : Promise.resolve(null),
    ])

    if (employee && employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee rule scope", 403)
    }
    if (department && department.companyId !== session.user.companyId) {
      return errorResponse("Invalid department rule scope", 403)
    }
    if (grade && grade.companyId !== session.user.companyId) {
      return errorResponse("Invalid grade rule scope", 403)
    }

    const rule = await prisma.$transaction(async (tx) => {
      const created = await tx.compensationRule.create({
        data: {
          companyId: session.user.companyId,
          name: validated.name,
          type: validated.type,
          calcMethod: validated.calcMethod,
          value: validated.value,
          cap: validated.cap,
          taxable: validated.taxable ?? false,
          currency: validated.currency ?? "USD",
          isActive: validated.isActive ?? true,
          workflowStatus: "DRAFT",
          employeeId: validated.employeeId,
          departmentId: validated.departmentId,
          gradeId: validated.gradeId,
          createdById: session.user.id,
        },
        include: {
          employee: { select: { id: true, employeeId: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          grade: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          submittedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "COMPENSATION_RULE",
        entityId: created.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
      })

      return created
    })

    return successResponse(rule, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/compensation/rules error:", error)
    return errorResponse("Failed to create compensation rule")
  }
}
