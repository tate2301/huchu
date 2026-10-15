import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { ROUTING_KINDS } from "@/lib/inbox/routing";
import { readSettings, saveSetting, SENT_CHANNELS, workspaceMatrix } from "@/lib/inbox/settings";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { prisma } from "@/lib/prisma";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

/**
 * Management → Notifications: the workspace's rule for each kind on each
 * channel (`NotificationSetting` with no person), changed here by managers
 * and owners, and Vane's quiet hours, changed through `/api/vane/settings` as
 * on Management → Vane.
 */

async function view(session: AuthenticatedSession) {
  const companyId = session.user.companyId;
  const [rows, company, vane] = await Promise.all([
    readSettings(prisma, companyId),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.vaneSettings.findUnique({ where: { companyId }, select: { quietFrom: true, quietTo: true } }),
  ]);
  return {
    kinds: workspaceMatrix(rows, session.user.enabledFeatures ?? []),
    workspaceName: company?.name ?? "this workspace",
    quiet: { from: vane?.quietFrom ?? "20:00", to: vane?.quietTo ?? "06:00" },
    canChangeQuiet: hasRole(session, VANE_SETTINGS_ROLES),
  };
}

const REFUSED = "Only managers and owners set who hears about what. Your own notifications are in My account.";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isOrgAdminRole(session.user.role)) return errorResponse(REFUSED, 403);
    return successResponse(await view(session));
  } catch (error) {
    console.error("[API] GET /api/notifications/routing error:", error);
    return errorResponse("Could not read who hears about what");
  }
}

const patchSchema = z.object({
  kind: z.enum(ROUTING_KINDS.map((kind) => kind.key) as [string, ...string[]]),
  channel: z.enum(SENT_CHANNELS),
  enabled: z.boolean(),
});

/** One kind on one channel, on or off for the whole workspace. */
export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isOrgAdminRole(session.user.role)) return errorResponse(REFUSED, 403);
    const body = patchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Choose a kind and a channel", 400);
    await saveSetting(prisma, { companyId: session.user.companyId, userId: null, ...body.data, updatedById: session.user.id });
    return successResponse(await view(session));
  } catch (error) {
    console.error("[API] PATCH /api/notifications/routing error:", error);
    return errorResponse("That setting was not saved");
  }
}
