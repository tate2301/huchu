import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { scoreLead } from "@corelithzw/module-crm/lead-scoring";
import { prisma } from "@corelithzw/db/client";
import { recordFieldChanges } from "@corelithzw/module-crm/history";
import { canEditRecord, canUser, denialMessage } from "@corelithzw/module-crm/permissions";
import { crmLeadChannelSchema } from "@corelithzw/module-crm/views";
import {
  buildCustomFieldValues,
  mergeCustomFields,
  type FieldDefinition,
} from "@corelithzw/module-records/custom-fields";
import { isCompanyUser } from "../../_helpers";

const updateSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  contactEmail: z.string().trim().email().max(200).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  estimatedValue: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().trim().max(10).optional(),
  services: z.array(z.string().trim().max(80)).max(40).optional(),
  source: z.string().trim().max(120).nullable().optional(),
  sourceChannel: crmLeadChannelSchema.nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  // A lead is the one record type that never accepted the administrator's
  // own fields, so anything captured on an intake form could not be
  // corrected afterwards.
  customFields: z.record(z.string(), z.unknown()).optional(),
  clearCustomFields: z.array(z.string().trim().max(60)).max(50).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const lead = await prisma.crmLead.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        client: true,
        assignedTo: { select: { id: true, name: true } },
        documents: {
          orderBy: { createdAt: "desc" },
          include: {
            approval: {
              select: {
                token: true,
                status: true,
                respondedAt: true,
                // What the customer actually said, and whether they have so
                // much as opened it. All four have been stored since the
                // approval link shipped; none of them were ever read back.
                responseNote: true,
                responderName: true,
                firstViewedAt: true,
              },
            },
            // The document list needs the underlying record's own status and
            // balance — a CrmLeadDocument only knows the amount it was cut for,
            // not what has since been paid against it.
            quotation: {
              select: { id: true, quotationNumber: true, status: true, validUntil: true, total: true },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                dueDate: true,
                total: true,
                amountPaid: true,
                creditTotal: true,
                writeOffTotal: true,
              },
            },
            receipt: {
              select: { id: true, receiptNumber: true, receivedAt: true, amount: true, method: true },
            },
          },
        },
        activities: {
          orderBy: { occurredAt: "desc" },
          take: 100,
          // The history feed names who did it; without this every
          // entry reads as though it happened by itself.
          include: { createdBy: { select: { id: true, name: true } } },
        },
        followUps: { orderBy: { dueAt: "asc" } },
        appointments: { orderBy: { scheduledStart: "desc" } },
        intakeSubmissions: {
          select: { id: true, photoUrls: true, message: true, selectedServices: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    if (!lead) return errorResponse("Lead not found", 404);

    // Scored on read from what is actually on the record, so the number can
    // never drift from the reasons shown next to it.
    const scoreBreakdown = scoreLead({
      estimatedValue: lead.estimatedValue,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      clientId: lead.clientId,
      services: lead.services,
      sourceChannel: lead.sourceChannel,
      createdAt: lead.createdAt,
      firstContactAt: lead.firstContactAt,
      activityCount: lead.activities.filter((activity) => activity.type !== "SYSTEM").length,
      appointmentCount: lead.appointments.length,
      documentCount: lead.documents.length,
    });

    return successResponse({ ...lead, scoreBreakdown });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/leads/[id] error:", error);
    return errorResponse("Failed to fetch lead");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmLead.findFirst({
      where: { id, companyId: session.user.companyId },
      // The full row, not just the guard fields: recording what changed needs
      // the values as they were before the write.
      select: {
        id: true,
        assignedToId: true,
        customFields: true,
        title: true,
        clientId: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        probability: true,
        estimatedValue: true,
        currency: true,
        source: true,
        sourceChannel: true,
      },
    });
    if (!existing) return errorResponse("Lead not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only edit leads assigned to you", 403);
    }

    const data = updateSchema.parse(await request.json());
    if (data.clientId) {
      const client = await prisma.crmClient.findFirst({
        where: { id: data.clientId, companyId: session.user.companyId },
        select: { id: true },
      });
      if (!client) return errorResponse("Invalid client", 400);
    }
    if (!(await isCompanyUser(session.user.companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    // Merged, not replaced: the record page writes one property at a time,
    // and a whole-object write would drop every field it did not send.
    let customFields: ReturnType<typeof mergeCustomFields> | undefined;
    if (data.customFields || data.clearCustomFields) {
      const definitions = (await prisma.crmFieldDefinition.findMany({
        where: { companyId: session.user.companyId, entity: "LEAD", archivedAt: null },
        orderBy: { position: "asc" },
      })) as unknown as FieldDefinition[];
      const { values, errors } = buildCustomFieldValues(definitions, data.customFields, {
        partial: true,
      });
      if (errors.length > 0) return errorResponse("Validation failed", 400, errors);
      customFields = mergeCustomFields(existing.customFields, values, data.clearCustomFields ?? []);
    }

    // Throughout: `undefined` leaves a field alone, an explicit `null` clears
    // it. Inline editing on the record page depends on being able to empty a
    // field, not just overwrite it.
    const updated = await prisma.crmLead.update({
      where: { id },
      data: {
        title: data.title,
        clientId: data.clientId,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        probability: data.probability,
        estimatedValue: data.estimatedValue,
        currency: data.currency ?? undefined,
        services: data.services ?? undefined,
        source: data.source,
        sourceChannel: data.sourceChannel ?? undefined,
        assignedToId: data.assignedToId,
        ...(customFields !== undefined ? { customFields } : {}),
      },
    });

    // Leads recorded nothing. Every other record type wrote a field-change
    // trail, so "who dropped the value from 40k to 12k" was answerable
    // everywhere except on the record type people actually open.
    await recordFieldChanges(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      entity: "LEAD",
      recordId: id,
      before: existing,
      after: updated,
      fields: [
        "title",
        "clientId",
        "contactName",
        "contactEmail",
        "contactPhone",
        "probability",
        "estimatedValue",
        "currency",
        "source",
        "sourceChannel",
        "assignedToId",
      ],
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/leads/[id] error:", error);
    return errorResponse("Failed to update lead");
  }
}

/**
 * Destroy a lead and everything hanging off it.
 *
 * Leads had no removal of any kind: a duplicate typed twice, a test row, a
 * number somebody entered wrong stayed in the pipeline for good. Archiving
 * covers almost every one of those and is what the record page offers first —
 * this is the other case, where the row should never have existed and keeping
 * it is worse than losing it.
 *
 * Activities, follow-ups, appointments, comments and files go with it; the
 * schema cascades them. A converted lead is refused, because a deal points
 * back at it for attribution and the whole reason the lead is kept after
 * conversion is that source reporting reads it.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmLead.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, assignedToId: true, convertedAt: true, convertedDealId: true },
    });
    if (!existing) return errorResponse("Lead not found", 404);
    if (!(await canEditRecord(session, existing.assignedToId))) {
      return errorResponse("You can only delete leads assigned to you", 403);
    }
    // Owning a record and being allowed to destroy it are separate decisions.
    if (!(await canUser(session, "records.delete"))) {
      return errorResponse(denialMessage("records.delete"), 403);
    }

    if (existing.convertedAt) {
      return errorResponse(
        "This lead became a deal, and the deal still credits it for where the business came from. It is already archived.",
        409,
      );
    }

    await prisma.crmLead.delete({ where: { id } });
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/leads/[id] error:", error);
    return errorResponse("Failed to delete lead");
  }
}
