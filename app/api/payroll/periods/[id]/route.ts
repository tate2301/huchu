import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const dateInputSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))

const patchSchema = z
  .object({
    periodKey: z.string().regex(/^\d{4}-\d{2}(-H[12])?$/).optional(),
    cycle: z.enum(["MONTHLY", "FORTNIGHTLY"]).optional(),
    startDate: dateInputSchema.optional(),
    endDate: dateInputSchema.optional(),
    dueDate: dateInputSchema.optional(),
    status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "CLOSED"]).optional(),
    notes: z.string().max(1000).nullable().optional(),
    periodPurpose: z.enum(["STANDARD", "CONTRACTOR", "EDGE_CASE"]).optional(),
    appliesToContractorsOnly: z.boolean().optional(),
    employeeScopeIds: z.array(z.string().uuid()).max(500).optional(),
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

    const period = await prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        _count: { select: { runs: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    })
    if (!period || period.companyId !== session.user.companyId) {
      return errorResponse("Payroll period not found", 404)
    }

    return successResponse(period)
  } catch (error) {
    console.error("[API] GET /api/payroll/periods/[id] error:", error)
    return errorResponse("Failed to fetch payroll period")
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to edit payroll periods", 403)
    }

    const body = await request.json()
    const validated = patchSchema.parse(body)

    const existing = await prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        _count: { select: { runs: true } },
      },
    })
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Payroll period not found", 404)
    }
    if (existing.status === "CLOSED") {
      return errorResponse("Closed periods cannot be edited", 400)
    }

    const attemptsWindowMutation =
      validated.periodKey !== undefined ||
      validated.cycle !== undefined ||
      validated.startDate !== undefined ||
      validated.endDate !== undefined

    if (existing._count.runs > 0 && attemptsWindowMutation) {
      return errorResponse(
        "Cannot change period window or key after runs have been generated.",
        409,
      )
    }

    const nextStartDate = validated.startDate
      ? new Date(validated.startDate)
      : existing.startDate
    const nextEndDate = validated.endDate ? new Date(validated.endDate) : existing.endDate
    if (nextEndDate < nextStartDate) {
      return errorResponse("End date cannot be before start date", 400)
    }

    const updated = await prisma.payrollPeriod.update({
      where: { id },
      data: {
        periodKey: validated.periodKey,
        cycle: validated.cycle,
        startDate: validated.startDate ? new Date(validated.startDate) : undefined,
        endDate: validated.endDate ? new Date(validated.endDate) : undefined,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        status: validated.status,
        notes: validated.notes !== undefined ? validated.notes : undefined,
        periodPurpose: validated.periodPurpose,
        appliesToContractorsOnly: validated.appliesToContractorsOnly,
        employeeScopeJson:
          validated.employeeScopeIds !== undefined
            ? (validated.employeeScopeIds.length > 0
                ? JSON.stringify(validated.employeeScopeIds)
                : null)
            : undefined,
      },
      include: {
        _count: { select: { runs: true } },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/payroll/periods/[id] error:", error)
    return errorResponse("Failed to update payroll period")
  }
}
