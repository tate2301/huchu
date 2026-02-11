import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { emitIncidentNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const incidentSchema = z.object({
  siteId: z.string().uuid(),
  incidentDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  incidentType: z.string().min(1).max(100),
  severity: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  actionsTaken: z.string().max(5000).optional(),
  reportedBy: z.string().min(1).max(200),
  photoUrls: z.array(z.string().url().max(2048)).optional(),
  status: z.string().max(50).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const incidentType = searchParams.get("incidentType");
    const severity = searchParams.get("severity");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (incidentType) where.incidentType = incidentType;
    if (severity) where.severity = severity;
    if (status) where.status = status;
    const incidentDateFilter: { gte?: Date; lte?: Date } = {};
    if (startDate) incidentDateFilter.gte = new Date(startDate);
    if (endDate) incidentDateFilter.lte = new Date(endDate);
    if (Object.keys(incidentDateFilter).length > 0) {
      where.incidentDate = incidentDateFilter;
    }
    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { actionsTaken: { contains: search, mode: "insensitive" } },
        { reportedBy: { contains: search, mode: "insensitive" } },
      ];
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ incidentDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.incident.count({ where }),
    ]);

    return successResponse(paginationResponse(incidents, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/compliance/incidents error:", error);
    return errorResponse("Failed to fetch incidents");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = incidentSchema.parse(body);

    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true },
    });
    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403);
    }

    const incident = await prisma.incident.create({
      data: {
        siteId: validated.siteId,
        incidentDate: new Date(validated.incidentDate),
        incidentType: validated.incidentType,
        severity: validated.severity,
        description: validated.description,
        actionsTaken: validated.actionsTaken,
        reportedBy: validated.reportedBy,
        photoUrls: validated.photoUrls ? JSON.stringify(validated.photoUrls) : undefined,
        status: validated.status ?? "OPEN",
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
      },
    });

    await emitIncidentNotification(prisma, {
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      event: "CREATED",
      incident: {
        id: incident.id,
        incidentType: incident.incidentType,
        severity: incident.severity,
        status: incident.status,
        site: incident.site,
      },
    });

    return successResponse(incident, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/compliance/incidents error:", error);
    return errorResponse("Failed to create incident");
  }
}
