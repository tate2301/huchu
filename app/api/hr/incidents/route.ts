import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { emitHrIncidentNotification } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

const createIncidentSchema = z.object({
  employeeId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  sourceIncidentId: z.string().uuid().optional(),
  incidentDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  category: z.enum(["MISCONDUCT", "ATTENDANCE", "SAFETY_POLICY", "PERFORMANCE", "OTHER"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "UNDER_REVIEW", "CLOSED"]).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  investigationNotes: z.string().trim().max(5000).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const { page, limit, skip } = getPaginationParams(request)

    const employeeId = searchParams.get("employeeId")
    const siteId = searchParams.get("siteId")
    const sourceIncidentId = searchParams.get("sourceIncidentId")
    const status = searchParams.get("status")
    const severity = searchParams.get("severity")
    const category = searchParams.get("category")
    const search = searchParams.get("search")

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (employeeId) where.employeeId = employeeId
    if (siteId) where.siteId = siteId
    if (sourceIncidentId) where.sourceIncidentId = sourceIncidentId
    if (status) where.status = status
    if (severity) where.severity = severity
    if (category) where.category = category
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { investigationNotes: { contains: search, mode: "insensitive" } },
        { employee: { name: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [records, total] = await Promise.all([
      prisma.hrIncident.findMany({
        where,
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
        orderBy: [{ incidentDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.hrIncident.count({ where }),
    ])

    return successResponse(paginationResponse(records, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/hr/incidents error:", error)
    return errorResponse("Failed to fetch HR incidents")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to create HR incidents", 403)
    }

    const body = await request.json()
    const validated = createIncidentSchema.parse(body)

    const [employee, site, sourceIncident] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: validated.employeeId },
        select: { id: true, companyId: true },
      }),
      validated.siteId
        ? prisma.site.findUnique({
            where: { id: validated.siteId },
            select: { id: true, companyId: true },
          })
        : Promise.resolve(null),
      validated.sourceIncidentId
        ? prisma.incident.findUnique({
            where: { id: validated.sourceIncidentId },
            select: {
              id: true,
              siteId: true,
              site: { select: { companyId: true, id: true, name: true, code: true } },
            },
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
      validated.sourceIncidentId &&
      (!sourceIncident || sourceIncident.site.companyId !== session.user.companyId)
    ) {
      return errorResponse("Invalid linked compliance incident", 403)
    }

    const created = await prisma.hrIncident.create({
      data: {
        companyId: session.user.companyId,
        employeeId: validated.employeeId,
        siteId: validated.siteId,
        sourceIncidentId: validated.sourceIncidentId,
        incidentDate: new Date(validated.incidentDate),
        category: validated.category,
        severity: validated.severity ?? "MEDIUM",
        status: validated.status ?? "OPEN",
        title: validated.title,
        description: validated.description,
        investigationNotes: validated.investigationNotes,
        reportedById: session.user.id,
        resolvedById: validated.status === "CLOSED" ? session.user.id : undefined,
        resolvedAt: validated.status === "CLOSED" ? new Date() : undefined,
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

    await emitHrIncidentNotification(prisma, {
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      event: "CREATED",
      incident: {
        id: created.id,
        title: created.title,
        severity: created.severity,
        status: created.status,
        employee: { id: created.employee.id, employeeId: created.employee.employeeId, name: created.employee.name },
        site: created.site,
      },
    })

    return successResponse(created, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/hr/incidents error:", error)
    return errorResponse("Failed to create HR incident")
  }
}
