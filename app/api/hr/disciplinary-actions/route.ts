import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { createApprovalAction, ensureApproverRole } from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const createActionSchema = z.object({
  incidentId: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  actionType: z.enum(["WARNING", "PENALTY", "SUSPENSION", "TERMINATION", "OTHER"]),
  summary: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(5000).optional(),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  penaltyAmount: z.number().min(0).optional(),
  penaltyCurrency: z.string().trim().min(1).max(10).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)

    const employeeId = searchParams.get("employeeId")
    const incidentId = searchParams.get("incidentId")
    const status = searchParams.get("status")
    const actionType = searchParams.get("actionType")
    const penaltyStatus = searchParams.get("penaltyStatus")
    const search = searchParams.get("search")

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (employeeId) where.employeeId = employeeId
    if (incidentId) where.incidentId = incidentId
    if (status) where.status = status
    if (actionType) where.actionType = actionType
    if (penaltyStatus) where.penaltyStatus = penaltyStatus
    if (search) {
      where.OR = [
        { summary: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { employee: { name: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [records, total] = await Promise.all([
      prisma.disciplinaryAction.findMany({
        where,
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
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.disciplinaryAction.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/hr/disciplinary-actions error:", error)
    return errorResponse("Failed to fetch disciplinary actions")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create disciplinary actions", 403)
    }

    const body = await request.json()
    const validated = createActionSchema.parse(body)

    const [employee, incident] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: validated.employeeId },
        select: { id: true, companyId: true },
      }),
      validated.incidentId
        ? prisma.hrIncident.findUnique({
            where: { id: validated.incidentId },
            select: { id: true, companyId: true, employeeId: true },
          })
        : Promise.resolve(null),
    ])

    if (!employee || employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee", 403)
    }
    if (incident && incident.companyId !== session.user.companyId) {
      return errorResponse("Invalid HR incident", 403)
    }
    if (incident && incident.employeeId !== validated.employeeId) {
      return errorResponse("Selected incident does not belong to the selected employee", 400)
    }

    const penaltyAmount = Math.max(0, validated.penaltyAmount ?? 0)

    const created = await prisma.$transaction(async (tx) => {
      const action = await tx.disciplinaryAction.create({
        data: {
          companyId: session.user.companyId,
          incidentId: validated.incidentId,
          employeeId: validated.employeeId,
          actionType: validated.actionType,
          status: "DRAFT",
          summary: validated.summary,
          notes: validated.notes,
          effectiveDate: validated.effectiveDate ? new Date(validated.effectiveDate) : undefined,
          penaltyAmount,
          penaltyCurrency: validated.penaltyCurrency ?? "USD",
          penaltyStatus: penaltyAmount > 0 ? "PENDING" : "NONE",
          createdById: session.user.id,
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

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "DISCIPLINARY_ACTION",
        entityId: action.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
      })

      return action
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/disciplinary-actions error:", error)
    return errorResponse("Failed to create disciplinary action")
  }
}
