import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { ensureApproverRole } from "@/lib/hr-payroll"

const patchTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(1000).nullable().optional(),
    employmentType: z
      .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"])
      .nullable()
      .optional(),
    position: z
      .enum(["MANAGER", "CLERK", "SUPPORT_STAFF", "ENGINEERS", "CHEMIST", "MINERS"])
      .nullable()
      .optional(),
    baseAmount: z.number().min(0).optional(),
    currency: z.string().trim().min(1).max(10).optional(),
    isActive: z.boolean().optional(),
    ruleIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, { message: "No fields provided" })

type RouteParams = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const record = await prisma.compensationTemplate.findUnique({
      where: { id },
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

    if (!record || record.companyId !== session.user.companyId) {
      return errorResponse("Compensation template not found", 404)
    }

    return successResponse(record)
  } catch (error) {
    console.error("[API] GET /api/compensation/templates/[id] error:", error)
    return errorResponse("Failed to fetch compensation template")
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to edit compensation templates", 403)
    }

    const body = await request.json()
    const validated = patchTemplateSchema.parse(body)
    const ruleIds = validated.ruleIds ? Array.from(new Set(validated.ruleIds)) : undefined

    const existing = await prisma.compensationTemplate.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Compensation template not found", 404)
    }

    if (ruleIds && ruleIds.length > 0) {
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

    const updated = await prisma.$transaction(async (tx) => {
      if (ruleIds !== undefined) {
        await tx.compensationTemplateRule.deleteMany({
          where: { templateId: id },
        })
      }

      return tx.compensationTemplate.update({
        where: { id },
        data: {
          name: validated.name,
          description: validated.description === undefined ? undefined : validated.description,
          employmentType:
            validated.employmentType === undefined ? undefined : validated.employmentType,
          position: validated.position === undefined ? undefined : validated.position,
          baseAmount: validated.baseAmount,
          currency: validated.currency,
          isActive: validated.isActive,
          rules:
            ruleIds !== undefined
              ? {
                  create: ruleIds.map((ruleId, index) => ({
                    compensationRuleId: ruleId,
                    sortOrder: index,
                  })),
                }
              : undefined,
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
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/compensation/templates/[id] error:", error)
    return errorResponse("Failed to update compensation template")
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to delete compensation templates", 403)
    }

    const existing = await prisma.compensationTemplate.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Compensation template not found", 404)
    }

    await prisma.compensationTemplate.delete({ where: { id } })
    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/compensation/templates/[id] error:", error)
    return errorResponse("Failed to delete compensation template")
  }
}
