import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  buildCustomFieldValues,
  mergeCustomFields,
  type FieldDefinition,
} from "@corelithzw/module-records/custom-fields";
import { recordFieldChanges } from "@corelithzw/module-crm/history";
import { recordMarkFields } from "@corelithzw/module-crm/record-mark";

const updateSiteSchema = z.object({
  ...recordMarkFields,
  name: z.string().trim().min(1).max(200).optional(),
  clientId: z.string().uuid().nullable().optional(),
  addressLine: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  primaryContactId: z.string().uuid().nullable().optional(),
  accessInstructions: z.string().trim().max(2000).nullable().optional(),
  siteConditions: z.string().trim().max(4000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  tags: z.array(z.string().trim().max(60)).max(30).optional(),
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

    const site = await prisma.crmSite.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        client: true,
        primaryContact: true,
        deals: {
          take: 50,
          include: { stage: { select: { id: true, name: true, status: true } } },
        },
        appointments: {
          orderBy: { scheduledStart: "desc" },
          take: 50,
          include: { visitItems: { orderBy: { position: "asc" } } },
        },
      },
    });
    if (!site) return errorResponse("Site not found", 404);

    return successResponse(site);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/sites/[id] error:", error);
    return errorResponse("Failed to fetch site");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    // Sites carry no assignee, so there is no per-record edit guard here —
    // any CRM user may edit a site their company owns.
    const existing = await prisma.crmSite.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        clientId: true,
        addressLine: true,
        city: true,
        country: true,
        primaryContactId: true,
        customFields: true,
      },
    });
    if (!existing) return errorResponse("Site not found", 404);

    const data = updateSiteSchema.parse(await request.json());

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

    let customFields: ReturnType<typeof mergeCustomFields> | undefined;
    if (data.customFields || data.clearCustomFields) {
      const definitions = (await prisma.crmFieldDefinition.findMany({
        where: { companyId, entity: "SITE", archivedAt: null },
        orderBy: { position: "asc" },
      })) as unknown as FieldDefinition[];
      const { values, errors } = buildCustomFieldValues(definitions, data.customFields, {
        partial: true,
      });
      if (errors.length > 0) return errorResponse("Validation failed", 400, errors);
      customFields = mergeCustomFields(existing.customFields, values, data.clearCustomFields ?? []);
    }

    const updated = await prisma.crmSite.update({
      where: { id },
      data: {
        emoji: data.emoji,
        accent: data.accent,
        avatarUrl: data.avatarUrl,
        name: data.name,
        clientId: data.clientId,
        addressLine: data.addressLine,
        city: data.city,
        country: data.country,
        latitude: data.latitude,
        longitude: data.longitude,
        primaryContactId: data.primaryContactId,
        accessInstructions: data.accessInstructions,
        siteConditions: data.siteConditions,
        notes: data.notes,
        tags: data.tags,
        ...(customFields !== undefined ? { customFields } : {}),
        ...(data.archived !== undefined
          ? { archivedAt: data.archived ? new Date() : null }
          : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
        primaryContact: { select: { id: true, fullName: true } },
      },
    });

    await recordFieldChanges(prisma, {
      companyId,
      userId: session.user.id,
      entity: "SITE",
      recordId: id,
      before: existing,
      after: updated,
      fields: ["name", "clientId", "addressLine", "city", "country", "primaryContactId"],
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/sites/[id] error:", error);
    return errorResponse("Failed to update site");
  }
}
