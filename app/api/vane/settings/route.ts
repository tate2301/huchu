import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { setVanePaused } from "@/lib/vane/panel";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

const bodySchema = z.object({ paused: z.boolean() });

/** Pause or resume Vane for the workspace. Paused stops new jobs; what it raised stays readable. */
export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, VANE_SETTINGS_ROLES)) {
      return errorResponse("Only a manager can pause Vane", 403);
    }
    const body = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say whether Vane is paused", 400);
    await setVanePaused(prisma, { companyId: session.user.companyId, paused: body.data.paused });
    return successResponse({ paused: body.data.paused });
  } catch (error) {
    console.error("[API] PATCH /api/vane/settings error:", error);
    return errorResponse("Could not change Vane's settings");
  }
}
