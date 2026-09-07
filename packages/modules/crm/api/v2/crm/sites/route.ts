import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { listIdFilter, listRecordIds } from "../../../../lists";
import { buildCustomFieldValues, type FieldDefinition } from "@corelithzw/module-records/custom-fields";
import { recordMarkFields } from "../../../../record-mark";
import {
  boolParam,
  buildRecordOrderBy,
  buildSiteWhere,
  customFieldParams,
  listParam,
  recordSortSchema,
  siteFiltersSchema,
} from "../../../../records";

const createSiteSchema = z.object({
  ...recordMarkFields,
  name: z.string().trim().min(1).max(200),
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
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const parsed = siteFiltersSchema.safeParse({
      q: searchParams.get("q") || undefined,
      listId: searchParams.get("listId") || undefined,
      clientIds: listParam(searchParams, "clientIds"),
      cities: listParam(searchParams, "cities"),
      includeArchived: boolParam(searchParams, "includeArchived"),
      customFields: customFieldParams(searchParams),
    });
    const filters = parsed.success ? parsed.data : {};

    const baseWhere = buildSiteWhere(session.user.companyId, filters);
    // A filter on an empty list must return nothing — ignoring it would show
    // the whole table, which reads as though the filter had failed.
    const listIds = filters.listId
      ? await listRecordIds(prisma, {
          companyId: session.user.companyId,
          userId: session.user.id,
          listId: filters.listId,
        })
      : null;
    const where = { ...baseWhere, ...(listIdFilter(listIds) ?? {}) };
    const sort = recordSortSchema.safeParse({
      field: searchParams.get("sortField"),
      direction: searchParams.get("sortDir"),
    });

    const [sites, total] = await Promise.all([
      prisma.crmSite.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          primaryContact: { select: { id: true, fullName: true, phone: true } },
          _count: { select: { deals: true, appointments: true } },
        },
        orderBy: buildRecordOrderBy("SITE", sort.success ? sort.data : undefined),
        skip,
        take: limit,
      }),
      prisma.crmSite.count({ where }),
    ]);

    return successResponse(paginationResponse(sites, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/sites error:", error);
    return errorResponse("Failed to fetch sites");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createSiteSchema.parse(await request.json());

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

    const definitions = (await prisma.crmFieldDefinition.findMany({
      where: { companyId, entity: "SITE", archivedAt: null },
      orderBy: { position: "asc" },
    })) as unknown as FieldDefinition[];
    const { values, errors } = buildCustomFieldValues(definitions, data.customFields);
    if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

    const siteNo = await reserveIdentifier(prisma, { companyId, entity: "CRM_SITE" });
    const site = await prisma.crmSite.create({
      data: {
        companyId,
        siteNo,
        name: data.name,
        clientId: data.clientId ?? undefined,
        addressLine: data.addressLine ?? undefined,
        city: data.city ?? undefined,
        country: data.country ?? undefined,
        latitude: data.latitude ?? undefined,
        longitude: data.longitude ?? undefined,
        primaryContactId: data.primaryContactId ?? undefined,
        accessInstructions: data.accessInstructions ?? undefined,
        siteConditions: data.siteConditions ?? undefined,
        notes: data.notes ?? undefined,
        tags: data.tags ?? [],
        emoji: data.emoji,
        accent: data.accent,
        avatarUrl: data.avatarUrl,
        customFields: values,
        createdById: session.user.id,
      },
      include: {
        client: { select: { id: true, name: true } },
        primaryContact: { select: { id: true, fullName: true } },
      },
    });

    return successResponse(site, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/sites error:", error);
    return errorResponse("Failed to create site");
  }
}
