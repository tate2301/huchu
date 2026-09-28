import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";

const updateSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  outcomeNotes: z.string().trim().max(2000).nullable().optional(),
});

/**
 * One site visit, for its own page: who went where and for what, and what was
 * brought back — the checklist, the measurements, the answers and the photos
 * with where and when each was taken. The brief's share token stays out of
 * it: the page links to nothing that needs it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const visit = await prisma.crmAppointment.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        appointmentNo: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        location: true,
        outcomeNotes: true,
        completedAt: true,
        checklist: true,
        siteConditions: true,
        reportNotes: true,
        reportCompletedAt: true,
        latitude: true,
        longitude: true,
        assignedToId: true,
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        lead: { select: { id: true, leadNo: true, title: true } },
        deal: { select: { id: true, dealNo: true, title: true } },
        client: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, addressLine: true } },
        visitItems: { orderBy: { position: "asc" } },
        visitPhotos: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            url: true,
            fileName: true,
            contentType: true,
            caption: true,
            latitude: true,
            longitude: true,
            capturedAt: true,
          },
        },
        sections: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            name: true,
            kind: true,
            answers: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                questionLabel: true,
                questionType: true,
                valueText: true,
                valueNumber: true,
                valueBool: true,
                valueOptions: true,
                valueDate: true,
                notes: true,
                notApplicable: true,
              },
            },
          },
        },
        followUps: { orderBy: { dueAt: "asc" }, select: { id: true, title: true, dueAt: true, status: true } },
      },
    });
    if (!visit) return errorResponse("Site visit not found", 404);

    return successResponse({ visit, mayEdit: await canEditRecord(session, visit.assignedToId) });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/appointments/[id] error:", error);
    return errorResponse("Failed to load the site visit");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmAppointment.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, assignedToId: true },
    });
    if (!existing) return errorResponse("Appointment not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only edit site visits assigned to you", 403);
    }

    const data = updateSchema.parse(await request.json());
    const updated = await prisma.crmAppointment.update({
      where: { id },
      data: {
        status: data.status,
        scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : undefined,
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : undefined,
        location: data.location ?? undefined,
        outcomeNotes: data.outcomeNotes ?? undefined,
        completedAt: data.status === "COMPLETED" ? new Date() : undefined,
      },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/appointments/[id] error:", error);
    return errorResponse("Failed to update appointment");
  }
}
