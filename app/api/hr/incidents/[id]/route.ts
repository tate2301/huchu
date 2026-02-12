import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { emitHrIncidentNotification } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

const updateIncidentSchema = z.object({
  employeeId: z.string().uuid().optional(),
  siteId: z.string().uuid().nullable().optional(),
  sourceIncidentId: z.string().uuid().nullable().optional(),
  incidentDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  category: z.enum(["MISCONDUCT", "ATTENDANCE", "SAFETY_POLICY", "PERFORMANCE", "OTHER"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "UNDER_REVIEW", "CLOSED"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  investigationNotes: z.string().trim().max(5000).nullable().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

async function getIncidentForCompany(id: string, companyId: string) {
  const incident = await prisma.hrIncident.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, employeeId: true, name: true, companyId: true } },
      site: { select: { id: true, name: true, code: true, companyId: true } },
      sourceIncident: {
        select: {
          id: true,
          incidentType: true,
          status: true,
          severity: true,
          incidentDate: true,
          site: { select: { companyId: true, id: true, name: true, code: true } },
        },
      },
      reportedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
      _count: { select: { actions: true } },
    },
  })
  if (!incident || incident.companyId !== companyId) return null
  return incident
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const incident = await getIncidentForCompany(id, session.user.companyId)
    if (!incident) return errorResponse("HR incident not found", 404)

    return successResponse(incident)
  } catch (error) {
    console.error("[API] GET /api/hr/incidents/[id] error:", error)
    return errorResponse("Failed to fetch HR incident")
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update HR incidents", 403)
    }

    const existing = await getIncidentForCompany(id, session.user.companyId)
    if (!existing) return errorResponse("HR incident not found", 404)

    const body = await request.json()
    const validated = updateIncidentSchema.parse(body)
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400)
    }

    const nextEmployeeId = validated.employeeId ?? existing.employeeId
    const nextSiteId = validated.siteId === null ? null : validated.siteId ?? existing.siteId
    const nextSourceIncidentId =
      validated.sourceIncidentId === null
        ? null
        : validated.sourceIncidentId ?? existing.sourceIncidentId

    const [employee, site, sourceIncident] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: nextEmployeeId },
        select: { id: true, companyId: true },
      }),
      nextSiteId
        ? prisma.site.findUnique({
            where: { id: nextSiteId },
            select: { id: true, companyId: true },
          })
        : Promise.resolve(null),
      nextSourceIncidentId
        ? prisma.incident.findUnique({
            where: { id: nextSourceIncidentId },
            select: { id: true, site: { select: { companyId: true } } },
          })
        : Promise.resolve(null),
    ])

    if (!employee || employee.companyId !== session.user.companyId) {
      return errorResponse("Invalid employee", 403)
    }
    if (site && site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403)
    }
    if (
      nextSourceIncidentId &&
      (!sourceIncident || sourceIncident.site.companyId !== session.user.companyId)
    ) {
      return errorResponse("Invalid linked compliance incident", 403)
    }

    const statusChanged = validated.status && validated.status !== existing.status

    const updated = await prisma.hrIncident.update({
      where: { id },
      data: {
        employeeId: nextEmployeeId,
        siteId: nextSiteId,
        sourceIncidentId: nextSourceIncidentId,
        incidentDate: validated.incidentDate ? new Date(validated.incidentDate) : undefined,
        category: validated.category,
        severity: validated.severity,
        status: validated.status,
        title: validated.title,
        description: validated.description,
        investigationNotes:
          validated.investigationNotes !== undefined
            ? validated.investigationNotes
            : undefined,
        resolvedById:
          validated.status === "CLOSED"
            ? session.user.id
            : validated.status && validated.status !== "CLOSED"
              ? null
              : undefined,
        resolvedAt:
          validated.status === "CLOSED"
            ? new Date()
            : validated.status && validated.status !== "CLOSED"
              ? null
              : undefined,
      },
      include: {
        employee: { select: { id: true, employeeId: true, name: true } },
        site: { select: { id: true, name: true, code: true } },
        sourceIncident: {
          select: {
            id: true,
            incidentType: true,
            severity: true,
            status: true,
            incidentDate: true,
            site: { select: { id: true, name: true, code: true } },
          },
        },
        reportedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
        _count: { select: { actions: true } },
      },
    })

    if (statusChanged) {
      await emitHrIncidentNotification(prisma, {
        companyId: session.user.companyId,
        actorId: session.user.id,
        actorRole: session.user.role,
        event: "STATUS_CHANGED",
        previousStatus: existing.status,
        incident: {
          id: updated.id,
          title: updated.title,
          severity: updated.severity,
          status: updated.status,
          employee: {
            id: updated.employee.id,
            employeeId: updated.employee.employeeId,
            name: updated.employee.name,
          },
          site: updated.site,
        },
      })
    }

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/hr/incidents/[id] error:", error)
    return errorResponse("Failed to update HR incident")
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to delete HR incidents", 403)
    }

    const existing = await prisma.hrIncident.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        _count: { select: { actions: true } },
      },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("HR incident not found", 404)
    }
    if (existing._count.actions > 0) {
      return errorResponse("Incident has disciplinary actions and cannot be deleted", 400)
    }

    await prisma.hrIncident.delete({ where: { id } })
    return successResponse({ success: true })
  } catch (error) {
    console.error("[API] DELETE /api/hr/incidents/[id] error:", error)
    return errorResponse("Failed to delete HR incident")
  }
}
