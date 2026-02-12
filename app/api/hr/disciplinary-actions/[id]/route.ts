import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const updateActionSchema = z.object({
  incidentId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().optional(),
  actionType: z.enum(["WARNING", "PENALTY", "SUSPENSION", "TERMINATION", "OTHER"]).optional(),
  summary: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  penaltyAmount: z.number().min(0).optional(),
  penaltyCurrency: z.string().trim().min(1).max(10).optional(),
  penaltyStatus: z.enum(["NONE", "PENDING", "DEDUCTED", "PAID", "WAIVED"]).optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

async function getActionForCompany(id: string, companyId: string) {
  const action = await prisma.disciplinaryAction.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, employeeId: true, name: true, companyId: true } },
      incident: {
        select: {
          id: true,
          title: true,
          employeeId: true,
          companyId: true,
          category: true,
          severity: true,
          status: true,
          incidentDate: true,
        },
      },
      createdBy: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      appliedBy: { select: { id: true, name: true } },
    },
  })

  if (!action || action.companyId !== companyId) return null
  return action
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const action = await getActionForCompany(id, session.user.companyId)
    if (!action) return errorResponse("Disciplinary action not found", 404)

    return successResponse(action)
  } catch (error) {
    console.error("[API] GET /api/hr/disciplinary-actions/[id] error:", error)
    return errorResponse("Failed to fetch disciplinary action")
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update disciplinary actions", 403)
    }

    const existing = await getActionForCompany(id, session.user.companyId)
    if (!existing) return errorResponse("Disciplinary action not found", 404)
    if (!["DRAFT", "REJECTED", "APPROVED", "APPLIED"].includes(existing.status)) {
      return errorResponse("Only editable disciplinary actions can be updated", 400)
    }

    const body = await request.json()
    const validated = updateActionSchema.parse(body)
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400)
    }

    const nextEmployeeId = validated.employeeId ?? existing.employeeId
    const nextIncidentId = validated.incidentId === null ? null : validated.incidentId ?? existing.incidentId

    const [employee, incident] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: nextEmployeeId },
        select: { id: true, companyId: true },
      }),
      nextIncidentId
        ? prisma.hrIncident.findUnique({
            where: { id: nextIncidentId },
            select: { id: true, employeeId: true, companyId: true },
          })
        : Promise.resolve(null),
    ])

    if (!employee || employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee", 403)
    }
    if (incident && incident.companyId !== session.user.companyId) {
      return errorResponse("Invalid HR incident", 403)
    }
    if (incident && incident.employeeId !== nextEmployeeId) {
      return errorResponse("Incident does not match selected employee", 400)
    }

    const penaltyAmount = validated.penaltyAmount ?? existing.penaltyAmount
    const fallbackPenaltyStatus = penaltyAmount > 0 ? "PENDING" : "NONE"

    const updated = await prisma.disciplinaryAction.update({
      where: { id },
      data: {
        incidentId: nextIncidentId,
        employeeId: nextEmployeeId,
        actionType: validated.actionType,
        summary: validated.summary,
        notes: validated.notes !== undefined ? validated.notes : undefined,
        effectiveDate:
          validated.effectiveDate !== undefined
            ? validated.effectiveDate
              ? new Date(validated.effectiveDate)
              : null
            : undefined,
        penaltyAmount: validated.penaltyAmount,
        penaltyCurrency: validated.penaltyCurrency,
        penaltyStatus: validated.penaltyStatus ?? fallbackPenaltyStatus,
      },
      include: {
        employee: { select: { id: true, employeeId: true, name: true } },
        incident: {
          select: {
            id: true,
            title: true,
            category: true,
            severity: true,
            status: true,
            incidentDate: true,
          },
        },
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        appliedBy: { select: { id: true, name: true } },
      },
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/hr/disciplinary-actions/[id] error:", error)
    return errorResponse("Failed to update disciplinary action")
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to delete disciplinary actions", 403)
    }

    const existing = await prisma.disciplinaryAction.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Disciplinary action not found", 404)
    }
    if (!["DRAFT", "REJECTED"].includes(existing.status)) {
      return errorResponse("Only draft or rejected disciplinary actions can be deleted", 400)
    }

    await prisma.disciplinaryAction.delete({ where: { id } })
    return successResponse({ success: true })
  } catch (error) {
    console.error("[API] DELETE /api/hr/disciplinary-actions/[id] error:", error)
    return errorResponse("Failed to delete disciplinary action")
  }
}
