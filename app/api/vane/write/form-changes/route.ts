import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCrmCapability } from "@/app/api/v2/crm/_helpers";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { suggestFormChanges } from "@/lib/vane/form-changes";
import { VaneWriteRefused } from "@/lib/vane/write";

export const maxDuration = 60;

const bodySchema = z.object({ questionSetId: z.string().uuid() });

/** Vane's changes to a site-visit form, from its answers, for the person building it to keep or not. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("You cannot change the site-visit questions", 403);
    const { questionSetId } = bodySchema.parse(await request.json());
    const changes = await suggestFormChanges(prisma, { companyId: session.user.companyId, userId: session.user.id, name: session.user.name ?? null }, questionSetId);
    return successResponse({ changes });
  } catch (error) {
    if (error instanceof VaneWriteRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse("Name the form", 400);
    console.error("[API] POST /api/vane/write/form-changes error:", error);
    return errorResponse("Vane could not read the answers");
  }
}
