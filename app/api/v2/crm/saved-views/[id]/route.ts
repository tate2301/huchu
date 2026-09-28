import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

import {
  VIEW_INCLUDE,
  canEditView,
  nameTakenMessage,
  parseViewState,
  viewNameSchema,
  viewNameTaken,
} from "../_shared";

const updateViewSchema = z.object({
  name: viewNameSchema.optional(),
  state: z.unknown().optional(),
  isShared: z.boolean().optional(),
});

async function loadEditableView(companyId: string, user: { id: string; role?: string | null }, id: string) {
  const view = await prisma.crmSavedView.findFirst({
    where: { id, companyId },
    select: { id: true, register: true, createdById: true, isShared: true },
  });
  if (!view) return { view: null, allowed: false } as const;
  return { view, allowed: canEditView(view, user) } as const;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const { view, allowed } = await loadEditableView(session.user.companyId, session.user, id);
    if (!view) return errorResponse("Saved view not found", 404);
    if (!allowed) return errorResponse("You can only edit views you created", 403);

    const data = updateViewSchema.parse(await request.json());
    let state: Prisma.InputJsonValue | undefined;
    if (data.state !== undefined) {
      const parsed = parseViewState(view.register, data.state);
      if (!parsed) return errorResponse("This list cannot save views yet", 400);
      state = parsed as Prisma.InputJsonValue;
    }

    // Publishing needs the permission — and so does touching a view that is
    // already published. A rename or a filter change to a shared view changes
    // what the whole team sees; an admin who revoked `views.share` from this
    // person has said they may not do that any more, and a request that
    // merely omits `isShared` must not slip past the decision. The one thing
    // still allowed without it is withdrawing the view (`isShared: false`
    // alone), because taking your view back out of the team's sight is the
    // opposite of publishing.
    const withdrawingOnly = data.isShared === false && data.name === undefined && state === undefined;
    const touchesTheTeam = data.isShared === true || (view.isShared && !withdrawingOnly);
    if (touchesTheTeam && !(await canUser(session, "views.share"))) {
      return errorResponse(denialMessage("views.share"), 403);
    }
    if (data.name !== undefined) {
      const taken = await viewNameTaken({
        companyId: session.user.companyId,
        register: view.register,
        createdById: view.createdById,
        name: data.name,
        exceptId: view.id,
      });
      if (taken) return errorResponse(nameTakenMessage(data.name), 409);
    }

    const updated = await prisma.crmSavedView.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(state !== undefined ? { state } : {}),
        ...(data.isShared !== undefined ? { isShared: data.isShared } : {}),
      },
      include: VIEW_INCLUDE,
    });

    return successResponse({ ...updated, canEdit: true });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/saved-views/[id] error:", error);
    return errorResponse("Failed to update saved view");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const { view, allowed } = await loadEditableView(session.user.companyId, session.user, id);
    if (!view) return errorResponse("Saved view not found", 404);
    if (!allowed) return errorResponse("You can only delete views you created", 403);

    await prisma.crmSavedView.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/saved-views/[id] error:", error);
    return errorResponse("Failed to delete saved view");
  }
}
