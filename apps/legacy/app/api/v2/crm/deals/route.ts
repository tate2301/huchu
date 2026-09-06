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
import { ensureDefaultPipeline, firstOpenStage } from "@corelithzw/module-crm/pipelines";
import { listIdFilter, listRecordIds } from "@corelithzw/module-crm/lists";
import { buildCustomFieldValues, type FieldDefinition } from "@corelithzw/module-records/custom-fields";
import { recordMarkFields } from "@corelithzw/module-crm/record-mark";
import {
  boolParam,
  buildDealWhere,
  buildRecordOrderBy,
  customFieldParams,
  dealFiltersSchema,
  listParam,
  numberParam,
  recordSortSchema,
} from "@corelithzw/module-crm/records";
import { isCompanyUser } from "../_helpers";

const createDealSchema = z.object({
  ...recordMarkFields,
  title: z.string().trim().min(1).max(200),
  clientId: z.string().uuid().nullable().optional(),
  primaryContactId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  value: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().trim().max(10).optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  forecastCategory: z.enum(["PIPELINE", "BEST_CASE", "COMMIT", "CLOSED"]).optional(),
  expectedCloseDate: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  services: z.array(z.string().trim().max(80)).max(40).optional(),
  source: z.string().trim().max(120).nullable().optional(),
  sourceChannel: z
    .enum(["MANUAL", "WEB_FORM", "WEBHOOK", "SOCIAL", "ADS", "REFERRAL", "OTHER"])
    .optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const parsed = dealFiltersSchema.safeParse({
      q: searchParams.get("q") || undefined,
      listId: searchParams.get("listId") || undefined,
      pipelineIds: listParam(searchParams, "pipelineIds"),
      stageIds: listParam(searchParams, "stageIds"),
      statuses: listParam(searchParams, "statuses"),
      assignedToIds: listParam(searchParams, "assignedToIds"),
      clientIds: listParam(searchParams, "clientIds"),
      siteIds: listParam(searchParams, "siteIds"),
      forecastCategories: listParam(searchParams, "forecastCategories"),
      valueMin: numberParam(searchParams, "valueMin"),
      valueMax: numberParam(searchParams, "valueMax"),
      closeFrom: searchParams.get("closeFrom") || undefined,
      closeTo: searchParams.get("closeTo") || undefined,
      createdFrom: searchParams.get("createdFrom") || undefined,
      createdTo: searchParams.get("createdTo") || undefined,
      mineOnly: boolParam(searchParams, "mineOnly"),
      unassigned: boolParam(searchParams, "unassigned"),
      overdueOnly: boolParam(searchParams, "overdueOnly"),
      includeArchived: boolParam(searchParams, "includeArchived"),
      customFields: customFieldParams(searchParams),
    });
    const filters = parsed.success ? parsed.data : {};

    const baseWhere = buildDealWhere(session.user.companyId, filters, session.user.id);
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

    const [deals, total] = await Promise.all([
      prisma.crmDeal.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          primaryContact: { select: { id: true, fullName: true } },
          site: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true, status: true, colorToken: true, inactivityDays: true } },
          pipeline: { select: { id: true, name: true } },
          followUps: {
            where: { status: "PENDING" },
            orderBy: { dueAt: "asc" },
            take: 1,
            select: { id: true, title: true, dueAt: true },
          },
        },
        orderBy: buildRecordOrderBy("DEAL", sort.success ? sort.data : undefined),
        skip,
        take: limit,
      }),
      prisma.crmDeal.count({ where }),
    ]);

    const shaped = deals.map(({ followUps, ...deal }) => ({
      ...deal,
      nextFollowUp: followUps[0] ?? null,
    }));

    return successResponse(paginationResponse(shaped, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/deals error:", error);
    return errorResponse("Failed to fetch deals");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createDealSchema.parse(await request.json());

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

    const definitions = (await prisma.crmFieldDefinition.findMany({
      where: { companyId, entity: "DEAL", archivedAt: null },
      orderBy: { position: "asc" },
    })) as unknown as FieldDefinition[];
    const { values, errors } = buildCustomFieldValues(definitions, data.customFields);
    if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

    const deal = await prisma.$transaction(async (tx) => {
      let pipelineId = data.pipelineId ?? null;
      let stageId = data.stageId ?? null;

      if (!pipelineId || !stageId) {
        const pipeline = await ensureDefaultPipeline(tx, companyId);
        pipelineId = pipelineId ?? pipeline.id;
        if (!stageId) {
          const stage = firstOpenStage(pipeline.stages);
          if (!stage) throw new Error("That pipeline has no open stage to start in");
          stageId = stage.id;
        }
      }

      const stage = await tx.crmPipelineStage.findFirst({
        where: { id: stageId, companyId },
        select: { id: true, pipelineId: true, probability: true, status: true },
      });
      if (!stage) throw new Error("Invalid stage");
      if (stage.pipelineId !== pipelineId) {
        throw new Error("That stage belongs to a different pipeline");
      }

      const dealNo = await reserveIdentifier(tx, { companyId, entity: "CRM_DEAL" });
      const now = new Date();
      const created = await tx.crmDeal.create({
        data: {
          companyId,
          dealNo,
          title: data.title,
          clientId: data.clientId ?? undefined,
          primaryContactId: data.primaryContactId ?? undefined,
          siteId: data.siteId ?? undefined,
          pipelineId,
          stageId: stage.id,
          status: stage.status,
          value: data.value ?? undefined,
          currency: data.currency ?? "USD",
          probability: data.probability ?? stage.probability,
          forecastCategory: data.forecastCategory ?? "PIPELINE",
          expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
          assignedToId: data.assignedToId ?? undefined,
          services: data.services ?? [],
          source: data.source ?? undefined,
          sourceChannel: data.sourceChannel ?? "MANUAL",
          emoji: data.emoji,
          accent: data.accent,
          avatarUrl: data.avatarUrl,
          customFields: values,
          stageEnteredAt: now,
          createdById: session.user.id,
        },
        include: {
          client: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true, status: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      });

      // The primary contact is also a deal contact, so the related-people
      // panel and the header agree without a special case.
      if (data.primaryContactId) {
        await tx.crmDealContact.create({
          data: {
            companyId,
            dealId: created.id,
            personId: data.primaryContactId,
            role: "PRIMARY",
          },
        });
      }

      return created;
    });

    return successResponse(deal, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/deals error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to create deal", 400);
  }
}
