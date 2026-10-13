import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { deleteSavedView, renameSavedView } from "@/lib/saved-views/store";
import { savedViewPatchSchema } from "@/lib/saved-views/view";

type Context = { params: Promise<{ id: string }> };

const REFUSED = {
  403: "Only whoever saved it, or a manager once it is shared, can change this view",
  404: "Saved view not found",
} as const;

/** Rename a view. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    const parsed = savedViewPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That name could not be read", 400);
    const result = await renameSavedView(
      prisma,
      { id: user.id, role: user.role, companyId: user.companyId },
      (await params).id,
      parsed.data.name,
    );
    if (!result.ok) return errorResponse(REFUSED[result.status], result.status);
    return successResponse({ view: result.view });
  } catch (error) {
    console.error("[API] PATCH /api/saved-views/[id] error:", error);
    return errorResponse("Could not rename the view");
  }
}

/** Delete a view: your own, or a shared one if you manage the workspace. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { user } = sessionResult.session;
    const result = await deleteSavedView(prisma, { id: user.id, role: user.role, companyId: user.companyId }, (await params).id);
    if (!result.ok) return errorResponse(REFUSED[result.status], result.status);
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/saved-views/[id] error:", error);
    return errorResponse("Could not delete the view");
  }
}
