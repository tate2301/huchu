import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ROUTING_KINDS } from "@/lib/inbox/routing";
import { personalMatrix, readSettings, saveSetting, SENT_CHANNELS } from "@/lib/inbox/settings";
import { prisma } from "@/lib/prisma";

/**
 * My account → Notifications: what you hear about, kind by kind, in the app
 * and by email (`NotificationSetting` with your id). A kind the workspace
 * turned off on a channel stays off there whatever you choose, and says so.
 */

async function mine(companyId: string, userId: string, enabledFeatures: readonly string[]) {
  return { kinds: personalMatrix(await readSettings(prisma, companyId, [userId]), userId, enabledFeatures) };
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse(await mine(session.user.companyId, session.user.id, session.user.enabledFeatures ?? []));
  } catch (error) {
    console.error("[API] GET /api/notifications/settings error:", error);
    return errorResponse("Could not read what you hear about");
  }
}

const patchSchema = z.object({
  kind: z.enum(ROUTING_KINDS.map((kind) => kind.key) as [string, ...string[]]),
  channel: z.enum(SENT_CHANNELS),
  enabled: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = patchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Choose a kind and a channel", 400);
    await saveSetting(prisma, { companyId: session.user.companyId, userId: session.user.id, ...body.data, updatedById: session.user.id });
    return successResponse(await mine(session.user.companyId, session.user.id, session.user.enabledFeatures ?? []));
  } catch (error) {
    console.error("[API] PATCH /api/notifications/settings error:", error);
    return errorResponse("That setting was not saved");
  }
}
