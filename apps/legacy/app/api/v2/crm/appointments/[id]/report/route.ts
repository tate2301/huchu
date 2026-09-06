import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@/lib/crm/permissions";
import { buildDefaultChecklist, siteVisitReportSchema } from "@/lib/crm/site-visits";

async function loadAppointment(companyId: string, id: string) {
  return prisma.crmAppointment.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      appointmentNo: true,
      title: true,
      status: true,
      assignedToId: true,
      leadId: true,
      clientId: true,
      scheduledStart: true,
      scheduledEnd: true,
      location: true,
      outcomeNotes: true,
      checklist: true,
      photos: true,
      siteConditions: true,
      reportNotes: true,
      reportCompletedAt: true,
      completedAt: true,
      visitItems: { orderBy: { position: "asc" } },
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const appointment = await loadAppointment(session.user.companyId, id);
    if (!appointment) return errorResponse("Site visit not found", 404);

    return successResponse({
      ...appointment,
      // A visit that has never been written up starts from the standard
      // checklist rather than a blank page.
      checklist: appointment.checklist ?? buildDefaultChecklist(),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/appointments/[id]/report error:", error);
    return errorResponse("Failed to fetch site visit report");
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmAppointment.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, appointmentNo: true, assignedToId: true, leadId: true, clientId: true, status: true },
    });
    if (!existing) return errorResponse("Site visit not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only write up site visits assigned to you", 403);
    }

    const data = siteVisitReportSchema.parse(await request.json());
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      // Items are replaced wholesale: the report sheet always submits the full
      // list, and per-row diffing would buy nothing but bugs.
      if (data.items) {
        await tx.crmSiteVisitItem.deleteMany({ where: { appointmentId: id } });
        if (data.items.length > 0) {
          await tx.crmSiteVisitItem.createMany({
            data: data.items.map((item, index) => ({
              companyId: session.user.companyId,
              appointmentId: id,
              position: index,
              category: item.category ?? null,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit ?? null,
              widthMm: item.widthMm ?? null,
              heightMm: item.heightMm ?? null,
              depthMm: item.depthMm ?? null,
              specNotes: item.specNotes ?? null,
              unitPrice: item.unitPrice ?? null,
            })),
          });
        }
      }

      const appointment = await tx.crmAppointment.update({
        where: { id },
        data: {
          ...(data.checklist !== undefined ? { checklist: data.checklist } : {}),
          ...(data.photos !== undefined ? { photos: data.photos } : {}),
          ...(data.siteConditions !== undefined ? { siteConditions: data.siteConditions } : {}),
          ...(data.reportNotes !== undefined ? { reportNotes: data.reportNotes } : {}),
          ...(data.outcomeNotes !== undefined ? { outcomeNotes: data.outcomeNotes } : {}),
          ...(data.markCompleted
            ? { status: "COMPLETED" as const, completedAt: now, reportCompletedAt: now }
            : {}),
        },
        select: {
          id: true,
          appointmentNo: true,
          status: true,
          completedAt: true,
          reportCompletedAt: true,
          visitItems: { orderBy: { position: "asc" } },
        },
      });

      if (data.markCompleted && existing.leadId) {
        const itemCount = data.items?.length ?? appointment.visitItems.length;
        await tx.crmActivity.create({
          data: {
            companyId: session.user.companyId,
            type: "MEETING",
            leadId: existing.leadId,
            clientId: existing.clientId ?? undefined,
            subject: `Site visit ${existing.appointmentNo} completed`,
            body:
              itemCount > 0
                ? `${itemCount} item${itemCount === 1 ? "" : "s"} measured on site.`
                : "No measurements were recorded.",
            metadata: { appointmentId: id, itemCount },
            createdById: session.user.id,
            occurredAt: now,
          },
        });
      }

      return appointment;
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PUT /api/v2/crm/appointments/[id]/report error:", error);
    return errorResponse("Failed to save site visit report");
  }
}
