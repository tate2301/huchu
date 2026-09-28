import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { REGISTER_KEYS } from "@/lib/crm/registers/types";
import { prisma } from "@/lib/prisma";

import {
  VIEW_INCLUDE,
  canEditView,
  nameTakenMessage,
  parseViewState,
  viewNameSchema,
  viewNameTaken,
} from "./_shared";

const createViewSchema = z.object({
  register: z.enum(REGISTER_KEYS),
  name: viewNameSchema,
  state: z.unknown(),
  isShared: z.boolean().optional(),
});

/**
 * The saved views the reader can see — their own and the team's — of one list
 * (`?register=LEAD`), or of every list for the sidebar. Each says whether the
 * reader may change it, and the answer says whether they may share one.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const requested = new URL(request.url).searchParams.get("register");
    const register = REGISTER_KEYS.find((key) => key === requested);

    const [views, canShare] = await Promise.all([
      prisma.crmSavedView.findMany({
        where: {
          companyId: session.user.companyId,
          ...(register ? { register } : {}),
          // A view is visible when shared with the company or owned by the caller.
          OR: [{ isShared: true }, { createdById: session.user.id }],
        },
        include: VIEW_INCLUDE,
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      }),
      canUser(session, "views.share"),
    ]);

    return successResponse({
      data: views.map((view) => ({ ...view, canEdit: canEditView(view, session.user) })),
      canShare,
    });
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
    const state = parseViewState(data.register, data.state);
    if (!state) return errorResponse("This list cannot save views yet", 400);

    // Publishing a view to the whole team is its own permission — one person's
    // idea of "all open deals" becomes everybody's default otherwise.
    if (data.isShared && !(await canUser(session, "views.share"))) {
      return errorResponse(denialMessage("views.share"), 403);
    }
    const taken = await viewNameTaken({
      companyId: session.user.companyId,
      register: data.register,
      createdById: session.user.id,
      name: data.name,
    });
    if (taken) return errorResponse(nameTakenMessage(data.name), 409);

    const view = await prisma.crmSavedView.create({
      data: {
        companyId: session.user.companyId,
        register: data.register,
        name: data.name,
        state: state as Prisma.InputJsonValue,
        isShared: data.isShared ?? false,
        createdById: session.user.id,
      },
      include: VIEW_INCLUDE,
    });

    return successResponse({ ...view, canEdit: true }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/saved-views error:", error);
    return errorResponse("Failed to create saved view");
  }
}
