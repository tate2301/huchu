import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { prisma } from "@corelithzw/db/client";
import { hasCrmFullAccess } from "@/lib/crm/scope";
import { leadSortSchema } from "@/lib/crm/views";

const updateViewSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  viewType: z.enum(["TABLE", "BOARD", "CALENDAR"]).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  sort: leadSortSchema.nullable().optional(),
  columns: z.array(z.string().trim().max(60)).max(40).nullable().optional(),
  groupBy: z.string().trim().max(60).nullable().optional(),
  isShared: z.boolean().optional(),
});

/** Only the view's author (or a CRM manager) may change or delete it. */
async function loadEditableView(
  companyId: string,
  userId: string,
  role: string | null | undefined,
  id: string,
) {
  const view = await prisma.crmSavedView.findFirst({
    where: { id, companyId },
    select: { id: true, createdById: true, isShared: true },
  });
  if (!view) return { view: null, allowed: false } as const;
  const allowed = view.createdById === userId || hasCrmFullAccess(role);
  return { view, allowed } as const;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const { view, allowed } = await loadEditableView(
      session.user.companyId,
      session.user.id,
      session.user.role,
      id,
    );
    if (!view) return errorResponse("Saved view not found", 404);
    if (!allowed) return errorResponse("You can only edit views you created", 403);

    const data = updateViewSchema.parse(await request.json());
    // Publishing needs the permission — and so does touching a view that is
    // already published. A rename or a filter change to a shared view changes
    // what the whole team sees; an admin who revoked `views.share` from this
    // person has said they may not do that any more, and a request that
    // merely omits `isShared` must not slip past the decision. The one thing
    // still allowed without it is withdrawing the view (`isShared: false`
    // alone), because taking your view back out of the team's sight is the
    // opposite of publishing.
    const withdrawingOnly =
      data.isShared === false &&
      data.name === undefined &&
      data.viewType === undefined &&
      data.filters === undefined &&
      data.sort === undefined &&
      data.columns === undefined &&
      data.groupBy === undefined;
    const touchesTheTeam = data.isShared === true || (view.isShared && !withdrawingOnly);
    if (touchesTheTeam && !(await canUser(session, "views.share"))) {
      return errorResponse(denialMessage("views.share"), 403);
    }

    const updated = await prisma.crmSavedView.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.viewType !== undefined ? { viewType: data.viewType } : {}),
        ...(data.filters !== undefined ? { filters: data.filters as never } : {}),
        ...(data.columns !== undefined ? { columns: (data.columns ?? undefined) as never } : {}),
        ...(data.groupBy !== undefined ? { groupBy: data.groupBy } : {}),
        ...(data.sort !== undefined ? { sort: data.sort ?? undefined } : {}),
        ...(data.isShared !== undefined ? { isShared: data.isShared } : {}),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    return successResponse(updated);
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

    const { view, allowed } = await loadEditableView(
      session.user.companyId,
      session.user.id,
      session.user.role,
      id,
    );
    if (!view) return errorResponse("Saved view not found", 404);
    if (!allowed) return errorResponse("You can only delete views you created", 403);

    await prisma.crmSavedView.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/saved-views/[id] error:", error);
    return errorResponse("Failed to delete saved view");
  }
}
