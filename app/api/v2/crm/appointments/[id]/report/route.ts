import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { Prisma } from "@prisma/client";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import {
  buildDefaultChecklist,
  siteVisitReportSchema,
  type SiteVisitPhotoInput,
} from "@/lib/crm/site-visits";

/**
 * The report's own photos: the ones that belong to the visit as a whole.
 *
 * A photo can also hang off a question's answer — "photograph the cracks" —
 * and those are the question's, saved with it. The report sheet sends its
 * whole list on every save and anything missing from it is removed, so the
 * scope matters: a report save must never delete a question's evidence.
 */
const REPORT_PHOTOS = { sectionId: null, answerId: null } satisfies Prisma.CrmSiteVisitPhotoWhereInput;

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
      visitPhotos: {
        where: REPORT_PHOTOS,
        orderBy: { createdAt: "asc" },
        select: {
          clientPhotoId: true,
          url: true,
          blobPathname: true,
          fileName: true,
          contentType: true,
          size: true,
          caption: true,
          latitude: true,
          longitude: true,
          capturedAt: true,
        },
      },
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

    const { visitPhotos, ...rest } = appointment;
    const photos: SiteVisitPhotoInput[] = visitPhotos.map((photo) => ({
      clientPhotoId: photo.clientPhotoId,
      url: photo.url,
      pathname: photo.blobPathname,
      fileName: photo.fileName,
      contentType: photo.contentType,
      size: photo.size,
      caption: photo.caption,
      latitude: photo.latitude,
      longitude: photo.longitude,
      capturedAt: photo.capturedAt?.toISOString() ?? null,
    }));

    return successResponse({
      ...rest,
      // A visit that has never been written up starts from the standard
      // checklist rather than a blank page.
      checklist: appointment.checklist ?? buildDefaultChecklist(),
      photos,
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

      // Photos are reconciled rather than replaced. Each one keeps its row —
      // and the createdAt that orders the list — across saves, because the
      // sheet sends the same `clientPhotoId` every time; only the caption is
      // the rep's to change afterwards. Where and when a photo was taken is
      // what the camera said, read once on the phone, and a save does not get
      // to rewrite it.
      if (data.photos) {
        const kept = await tx.crmSiteVisitPhoto.findMany({
          where: { companyId: session.user.companyId, appointmentId: id, ...REPORT_PHOTOS },
          select: { id: true, clientPhotoId: true, caption: true },
        });
        const byClientId = new Map(kept.map((photo) => [photo.clientPhotoId, photo]));
        const submitted = new Set(data.photos.map((photo) => photo.clientPhotoId));

        const removed = kept.filter((photo) => !submitted.has(photo.clientPhotoId));
        if (removed.length > 0) {
          await tx.crmSiteVisitPhoto.deleteMany({
            where: { id: { in: removed.map((photo) => photo.id) } },
          });
        }

        for (const photo of data.photos) {
          const caption = photo.caption?.trim() || null;
          const existingPhoto = byClientId.get(photo.clientPhotoId);
          if (existingPhoto) {
            if (existingPhoto.caption !== caption) {
              await tx.crmSiteVisitPhoto.update({
                where: { id: existingPhoto.id },
                data: { caption },
              });
            }
            continue;
          }
          await tx.crmSiteVisitPhoto.create({
            data: {
              companyId: session.user.companyId,
              appointmentId: id,
              clientPhotoId: photo.clientPhotoId,
              blobPathname: photo.pathname,
              url: photo.url,
              fileName: photo.fileName ?? null,
              contentType: photo.contentType,
              size: photo.size,
              caption,
              latitude: photo.latitude ?? null,
              longitude: photo.longitude ?? null,
              capturedAt: photo.capturedAt ? new Date(photo.capturedAt) : null,
              uploadedById: session.user.id,
            },
          });
        }
      }

      const appointment = await tx.crmAppointment.update({
        where: { id },
        data: {
          ...(data.checklist !== undefined ? { checklist: data.checklist } : {}),
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
