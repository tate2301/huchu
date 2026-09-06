import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import {
  DEFAULT_LAYOUTS,
  OVERVIEW_SCOPES,
  overviewLayoutSchema,
  type OverviewScope,
  type WidgetInstance,
} from "@corelithzw/module-crm/widgets";

const scopeSchema = z.enum(OVERVIEW_SCOPES);

/**
 * One person's arrangement of an overview, falling back through the company's
 * default to the built-in one.
 *
 * Three layers rather than two, because the alternative is that a company
 * that has arranged its deal overview still hands every new joiner the stock
 * arrangement — and that company took the trouble precisely so nobody would
 * have to.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = scopeSchema.safeParse(searchParams.get("scope"));
    if (!parsed.success) return errorResponse("Unknown overview", 400);
    const scope: OverviewScope = parsed.data;

    const [mine, company] = await Promise.all([
      prisma.crmOverviewLayout.findFirst({
        where: { companyId: session.user.companyId, userId: session.user.id, scope },
        select: { widgets: true },
      }),
      prisma.crmOverviewLayout.findFirst({
        where: { companyId: session.user.companyId, userId: null, scope },
        select: { widgets: true },
      }),
    ]);

    const widgets = (mine?.widgets ?? company?.widgets ?? DEFAULT_LAYOUTS[scope]) as
      | WidgetInstance[];

    return successResponse({
      scope,
      widgets,
      // The page shows a "reset to default" only when there is something to
      // reset to — otherwise it is a button that does nothing visible.
      isCustomised: Boolean(mine),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/overview-layout error:", error);
    return errorResponse("Failed to load the overview");
  }
}

/** Saves the caller's own arrangement. Nobody edits anyone else's from here. */
export async function PUT(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = overviewLayoutSchema.parse(await request.json());

    // Prisma's Json input type does not accept a typed array directly; the
    // shape has already been validated by the schema above.
    const widgets = body.widgets as unknown as Prisma.InputJsonValue;

    const saved = await prisma.crmOverviewLayout.upsert({
      where: {
        companyId_userId_scope: {
          companyId: session.user.companyId,
          userId: session.user.id,
          scope: body.scope,
        },
      },
      create: {
        companyId: session.user.companyId,
        userId: session.user.id,
        scope: body.scope,
        widgets,
      },
      update: { widgets },
      select: { widgets: true },
    });

    return successResponse({ scope: body.scope, widgets: saved.widgets, isCustomised: true });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Invalid layout", 400);
    console.error("[API] PUT /api/v2/crm/overview-layout error:", error);
    return errorResponse("Failed to save the overview");
  }
}

/** Drops the caller's arrangement, so they fall back to the shared one. */
export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = scopeSchema.safeParse(searchParams.get("scope"));
    if (!parsed.success) return errorResponse("Unknown overview", 400);

    await prisma.crmOverviewLayout.deleteMany({
      where: {
        companyId: session.user.companyId,
        userId: session.user.id,
        scope: parsed.data,
      },
    });

    return successResponse({ scope: parsed.data, reset: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/overview-layout error:", error);
    return errorResponse("Failed to reset the overview");
  }
}
