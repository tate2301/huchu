import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import {
  buildCustomFieldValues,
  mergeCustomFields,
  type FieldDefinition,
} from "@/lib/crm/custom-fields";
import { recordFieldChanges } from "@/lib/crm/history";
import { recordMarkFields } from "@/lib/crm/record-mark";
import { isCompanyUser } from "../../_helpers";
import { recordFieldChanges as recordFieldDiff } from "@/lib/crm/field-history";

// stageId and status are deliberately absent: a stage move has side effects
// (stageEnteredAt, probability, won/lost stamps) and belongs to the stage
// route. Zod drops them if a client sends them anyway.
const updateDealSchema = z.object({
  ...recordMarkFields,
  title: z.string().trim().min(1).max(200).optional(),
  clientId: z.string().uuid().nullable().optional(),
  primaryContactId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  value: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().trim().max(10).optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  forecastCategory: z.enum(["PIPELINE", "BEST_CASE", "COMMIT", "CLOSED"]).optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  services: z.array(z.string().trim().max(80)).max(40).optional(),
  source: z.string().trim().max(120).nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  clearCustomFields: z.array(z.string().trim().max(60)).max(50).optional(),
  archived: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const deal = await prisma.crmDeal.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        client: true,
        primaryContact: true,
        site: true,
        assignedTo: { select: { id: true, name: true } },
        stage: true,
        pipeline: {
          include: {
            stages: { where: { archivedAt: null }, orderBy: { position: "asc" } },
          },
        },
        contacts: { include: { person: true } },
        activities: {
          orderBy: { occurredAt: "desc" },
          take: 100,
          // The history feed names who did it; without this every
          // entry reads as though it happened by itself.
          include: { createdBy: { select: { id: true, name: true } } },
        },
        followUps: { orderBy: { dueAt: "asc" } },
        appointments: { orderBy: { scheduledStart: "desc" } },
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
      },
    });
    if (!deal) return errorResponse("Deal not found", 404);

    return successResponse(deal);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/deals/[id] error:", error);
    return errorResponse("Failed to fetch deal");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmDeal.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        title: true,
        clientId: true,
        primaryContactId: true,
        siteId: true,
        value: true,
        currency: true,
        probability: true,
        forecastCategory: true,
        expectedCloseDate: true,
        assignedToId: true,
        customFields: true,
      },
    });
    if (!existing) return errorResponse("Deal not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only edit deals assigned to you", 403);
    }

    const data = updateDealSchema.parse(await request.json());

    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }
    // Every referenced record has to belong to this tenant.
    if (data.clientId) {
      const client = await prisma.crmClient.findFirst({
        where: { id: data.clientId, companyId },
        select: { id: true },
      });
      if (!client) return errorResponse("Invalid company", 400);
    }
    if (data.primaryContactId) {
      const person = await prisma.crmPerson.findFirst({
        where: { id: data.primaryContactId, companyId },
        select: { id: true },
      });
      if (!person) return errorResponse("Invalid contact", 400);
    }
    if (data.siteId) {
      const site = await prisma.crmSite.findFirst({
        where: { id: data.siteId, companyId },
        select: { id: true },
      });
      if (!site) return errorResponse("Invalid site", 400);
    }

    let customFields: ReturnType<typeof mergeCustomFields> | undefined;
    if (data.customFields || data.clearCustomFields) {
      const definitions = (await prisma.crmFieldDefinition.findMany({
        where: { companyId, entity: "DEAL", archivedAt: null },
        orderBy: { position: "asc" },
      })) as unknown as FieldDefinition[];
      const { values, errors } = buildCustomFieldValues(definitions, data.customFields, {
        partial: true,
      });
      if (errors.length > 0) return errorResponse("Validation failed", 400, errors);
      customFields = mergeCustomFields(existing.customFields, values, data.clearCustomFields ?? []);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.crmDeal.update({
        where: { id },
        data: {
          emoji: data.emoji,
          accent: data.accent,
          avatarUrl: data.avatarUrl,
          title: data.title,
          clientId: data.clientId,
          primaryContactId: data.primaryContactId,
          siteId: data.siteId,
          value: data.value,
          currency: data.currency,
          probability: data.probability,
          forecastCategory: data.forecastCategory,
          ...(data.expectedCloseDate !== undefined
            ? {
                expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
              }
            : {}),
          assignedToId: data.assignedToId,
          services: data.services,
          source: data.source,
          ...(customFields !== undefined ? { customFields } : {}),
          ...(data.archived !== undefined
            ? { archivedAt: data.archived ? new Date() : null }
            : {}),
        },
        include: {
          client: { select: { id: true, name: true } },
          primaryContact: { select: { id: true, fullName: true } },
          site: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true, status: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      });

      // One row per field that actually moved, written with the change it
      // describes. Before, this ran ahead of the update and outside any
      // transaction, so an update that failed still left history behind
      // saying it had happened.
      await recordFieldDiff(tx, {
        companyId,
        entity: "DEAL",
        recordId: id,
        changedById: session.user.id,
        before: existing as Record<string, unknown>,
        update: data as Record<string, unknown>,
      });

      return row;
    });

    await recordFieldChanges(prisma, {
      companyId,
      userId: session.user.id,
      entity: "DEAL",
      recordId: id,
      before: existing,
      after: updated,
      fields: [
        "title",
        "clientId",
        "primaryContactId",
        "siteId",
        "value",
        "currency",
        "probability",
        "forecastCategory",
        "expectedCloseDate",
        "assignedToId",
      ],
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/deals/[id] error:", error);
    return errorResponse("Failed to update deal");
  }
}
