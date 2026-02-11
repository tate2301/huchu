import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { emitIncidentNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const updateIncidentSchema = z.object({
  incidentDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  incidentType: z.string().min(1).max(100).optional(),
  severity: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(5000).optional(),
  actionsTaken: z.string().max(5000).nullable().optional(),
  reportedBy: z.string().min(1).max(200).optional(),
  photoUrls: z.array(z.string().url().max(2048)).nullable().optional(),
  status: z.string().max(50).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function getIncidentForCompany(id: string, companyId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      site: { select: { companyId: true, id: true, name: true, code: true } },
    },
  });
  if (!incident || incident.site.companyId !== companyId) return null;
  return incident;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const incident = await getIncidentForCompany(id, session.user.companyId);
    if (!incident) return errorResponse("Incident not found", 404);
    return successResponse(incident);
  } catch (error) {
    console.error("[API] GET /api/compliance/incidents/[id] error:", error);
    return errorResponse("Failed to fetch incident");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await getIncidentForCompany(id, session.user.companyId);
    if (!existing) return errorResponse("Incident not found", 404);

    const body = await request.json();
    const validated = updateIncidentSchema.parse(body);
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400);
    }

    const incident = await prisma.incident.update({
      where: { id },
      data: {
        incidentDate: validated.incidentDate ? new Date(validated.incidentDate) : undefined,
        incidentType: validated.incidentType,
        severity: validated.severity,
        description: validated.description,
        actionsTaken:
          validated.actionsTaken !== undefined ? validated.actionsTaken : undefined,
        reportedBy: validated.reportedBy,
        photoUrls:
          validated.photoUrls !== undefined
            ? validated.photoUrls
              ? JSON.stringify(validated.photoUrls)
              : null
            : undefined,
        status: validated.status,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
      },
    });

    if (validated.status && validated.status !== existing.status) {
      await emitIncidentNotification(prisma, {
        companyId: session.user.companyId,
        actorId: session.user.id,
        actorRole: session.user.role,
        event: "STATUS_CHANGED",
        previousStatus: existing.status,
        incident: {
          id: incident.id,
          incidentType: incident.incidentType,
          severity: incident.severity,
          status: incident.status,
          site: incident.site,
        },
      });
    }

    return successResponse(incident);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/compliance/incidents/[id] error:", error);
    return errorResponse("Failed to update incident");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await getIncidentForCompany(id, session.user.companyId);
    if (!existing) return errorResponse("Incident not found", 404);

    await prisma.incident.delete({ where: { id } });
    return successResponse({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/compliance/incidents/[id] error:", error);
    return errorResponse("Failed to delete incident");
  }
}
