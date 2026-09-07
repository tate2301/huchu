import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { canUser, denialMessage } from "../../../../permissions";
import { prisma } from "@corelithzw/db/client";
import { leadSortSchema } from "../../../../views";
import { allowedViewTypes, VIEW_ENTITY_KEYS, type ViewEntity } from "../../../../views-registry";

const createViewSchema = z.object({
  entity: z.enum(VIEW_ENTITY_KEYS).optional(),
  name: z.string().trim().min(1).max(80),
  viewType: z.enum(["TABLE", "BOARD", "CALENDAR"]).optional(),
  // Filters vary by record type, so they are validated by the endpoint that
  // consumes them rather than here — a view only stores them.
  filters: z.record(z.string(), z.unknown()),
  sort: leadSortSchema.nullable().optional(),
  columns: z.array(z.string().trim().max(60)).max(40).nullable().optional(),
  groupBy: z.string().trim().max(60).nullable().optional(),
  isShared: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("entity");
    const entity = VIEW_ENTITY_KEYS.find((value) => value === requested);

    const views = await prisma.crmSavedView.findMany({
      where: {
        companyId: session.user.companyId,
        ...(entity ? { entity } : {}),
        // A view is visible when shared with the company or owned by the caller.
        OR: [{ isShared: true }, { createdById: session.user.id }],
      },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ isShared: "desc" }, { name: "asc" }],
    });

    return successResponse({ data: views });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/saved-views error:", error);
    return errorResponse("Failed to fetch saved views");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const data = createViewSchema.parse(await request.json());
    const entity = (data.entity ?? "LEAD") as ViewEntity;

    // A board of people has no columns worth having, so the view type has to
    // be one this record type can actually render.
    const viewType = data.viewType ?? "TABLE";
    if (!allowedViewTypes(entity).includes(viewType)) {
      return errorResponse(`${entity.toLowerCase()} records can't be shown as a ${viewType.toLowerCase()}`, 400);
    }

    // Publishing a view to the whole team is its own permission — one person's
    // idea of "all open deals" becomes everybody's default otherwise.
    if (data.isShared && !(await canUser(session, "views.share"))) {
      return errorResponse(denialMessage("views.share"), 403);
    }

    const view = await prisma.crmSavedView.create({
      data: {
        companyId: session.user.companyId,
        entity,
        name: data.name,
        viewType,
        filters: data.filters as never,
        sort: data.sort ?? undefined,
        columns: (data.columns ?? undefined) as never,
        groupBy: data.groupBy ?? undefined,
        isShared: data.isShared ?? false,
        createdById: session.user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    return successResponse(view, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/saved-views error:", error);
    return errorResponse("Failed to create saved view");
  }
}
