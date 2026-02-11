import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"

const updateProfileSchema = z
  .object({
    baseAmount: z.number().min(0).optional(),
    currency: z.string().min(1).max(10).optional(),
    effectiveFrom: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .optional(),
    effectiveTo: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .nullable()
      .optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    notes: z.string().max(1000).optional(),
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

    const profile = await prisma.compensationProfile.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            companyId: true,
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
    })

    if (!profile || profile.employee.companyId !== session.user.companyId) {
      return errorResponse("Compensation profile not found", 404)
    }

    return successResponse(profile)
  } catch (error) {
    console.error("[API] GET /api/compensation/profiles/[id] error:", error)
    return errorResponse("Failed to fetch compensation profile")
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
    const validated = updateProfileSchema.parse(body)

    const existing = await prisma.compensationProfile.findUnique({
      where: { id },
      include: { employee: { select: { companyId: true } } },
    })
    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Compensation profile not found", 404)
    }
    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to edit compensation profiles", 403)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.workflowStatus)) {
      return errorResponse("Only draft or rejected profiles can be edited", 400)
    }

    const updated = await prisma.$transaction(async (tx) => {
      const effectiveFrom = validated.effectiveFrom ? new Date(validated.effectiveFrom) : undefined
      const effectiveTo =
        validated.effectiveTo !== undefined
          ? validated.effectiveTo
            ? new Date(validated.effectiveTo)
            : null
          : undefined

      const saved = await tx.compensationProfile.update({
        where: { id },
        data: {
          baseAmount: validated.baseAmount,
          currency: validated.currency,
          effectiveFrom,
          effectiveTo,
          status: validated.status,
          notes: validated.notes,
          workflowStatus: "DRAFT",
          submittedById: null,
          submittedAt: null,
          approvedById: null,
          approvedAt: null,
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
        entityId: id,
        action: "ADJUST",
        actedById: session.user.id,
        fromStatus: existing.workflowStatus,
        toStatus: "DRAFT",
        note: "Compensation profile edited and returned to draft.",
      })

      return saved
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/compensation/profiles/[id] error:", error)
    return errorResponse("Failed to update compensation profile")
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
      return errorResponse("Insufficient permissions to delete profiles", 403)
    }

    const existing = await prisma.compensationProfile.findUnique({
      where: { id },
      include: { employee: { select: { companyId: true } } },
    })
    if (!existing || existing.employee.companyId !== session.user.companyId) {
      return errorResponse("Compensation profile not found", 404)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.workflowStatus)) {
      return errorResponse("Only draft or rejected profiles can be deleted", 400)
    }

    const linkedLineItems = await prisma.payrollLineItem.count({
      where: { compensationProfileId: id },
    })
    if (linkedLineItems > 0) {
      return errorResponse("Profile has linked payroll records and cannot be deleted", 409)
    }

    await prisma.compensationProfile.delete({ where: { id } })
    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/compensation/profiles/[id] error:", error)
    return errorResponse("Failed to delete compensation profile")
  }
}
