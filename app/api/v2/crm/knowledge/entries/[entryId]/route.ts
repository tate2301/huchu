import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { editEntry, entryInputSchema, removeEntry } from "@/lib/crm/knowledge/entries";
import { prisma } from "@/lib/prisma";

import { requireCrmCapability } from "../../../_helpers";

type Params = { params: Promise<{ entryId: string }> };

/** Changes an entry. One Vane found becomes the person's, and kept, once they change it. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("Changing the knowledge base is a CRM settings change", 403);
    const changed = await editEntry(prisma, { companyId: session.user.companyId, userId: session.user.id }, (await params).entryId, entryInputSchema.parse(await request.json()));
    if (!changed) return errorResponse("That entry is not in the knowledge base", 404);
    return successResponse({ changed });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Fill it in", 400);
    console.error("[API] PATCH /api/v2/crm/knowledge/entries/[entryId] error:", error);
    return errorResponse("Could not change it");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("Changing the knowledge base is a CRM settings change", 403);
    if (!(await removeEntry(prisma, session.user.companyId, (await params).entryId))) return errorResponse("That entry is not in the knowledge base", 404);
    return successResponse({ removed: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/knowledge/entries/[entryId] error:", error);
    return errorResponse("Could not remove it");
  }
}
