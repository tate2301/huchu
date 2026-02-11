import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"

const updateRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    type: z.enum(["ALLOWANCE", "DEDUCTION"]).optional(),
    calcMethod: z.enum(["FIXED", "PERCENT"]).optional(),
    value: z.number().min(0).optional(),
    cap: z.number().min(0).nullable().optional(),
    taxable: z.boolean().optional(),
    currency: z.string().min(1).max(10).optional(),
    isActive: z.boolean().optional(),
    employeeId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    gradeId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields provided" })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const rule = await prisma.compensationRule.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
        grade: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    })
    if (!rule || rule.companyId !== session.user.companyId) {
      return errorResponse("Compensation rule not found", 404)
    }

    return successResponse(rule)
  } catch (error) {
    console.error("[API] GET /api/compensation/rules/[id] error:", error)
    return errorResponse("Failed to fetch compensation rule")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const body = await request.json()
    const validated = updateRuleSchema.parse(body)

    const existing = await prisma.compensationRule.findUnique({
      where: { id },
      select: { companyId: true, workflowStatus: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Compensation rule not found", 404)
    }
    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to edit rules", 403)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.workflowStatus)) {
      return errorResponse("Only draft or rejected rules can be edited", 400)
    }

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

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.compensationRule.update({
        where: { id },
        data: {
          ...validated,
          workflowStatus: "DRAFT",
          submittedById: null,
          submittedAt: null,
          approvedById: null,
          approvedAt: null,
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
        entityId: id,
        action: "ADJUST",
        actedById: session.user.id,
        fromStatus: existing.workflowStatus,
        toStatus: "DRAFT",
        note: "Compensation rule edited and returned to draft.",
      })

      return saved
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/compensation/rules/[id] error:", error)
    return errorResponse("Failed to update compensation rule")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to delete rules", 403)
    }

    const existing = await prisma.compensationRule.findUnique({
      where: { id },
      select: { companyId: true, workflowStatus: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Compensation rule not found", 404)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.workflowStatus)) {
      return errorResponse("Only draft or rejected rules can be deleted", 400)
    }

    await prisma.compensationRule.delete({ where: { id } })

    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/compensation/rules/[id] error:", error)
    return errorResponse("Failed to delete compensation rule")
  }
}
