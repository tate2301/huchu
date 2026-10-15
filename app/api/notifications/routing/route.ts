import { NextRequest, NextResponse } from "next/server";

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import { readRouting } from "@/lib/inbox/routing-read";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { prisma } from "@/lib/prisma";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

/**
 * Management → Notifications: who each kind reached in the last 30 days, and
 * Vane's quiet hours. Read only; the quiet hours are changed through
 * `/api/vane/settings`, as on Management → Vane.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isOrgAdminRole(session.user.role)) {
      return errorResponse("Only managers and owners see who hears about what. Your own notifications are in My account.", 403);
    }
    const [routing, company, vane] = await Promise.all([
      readRouting(prisma, session.user.companyId, session.user.enabledFeatures ?? []),
      prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } }),
      prisma.vaneSettings.findUnique({ where: { companyId: session.user.companyId }, select: { quietFrom: true, quietTo: true } }),
    ]);
    return successResponse({
      routing,
      workspaceName: company?.name ?? "this workspace",
      quiet: { from: vane?.quietFrom ?? "20:00", to: vane?.quietTo ?? "06:00" },
      canChangeQuiet: hasRole(session, VANE_SETTINGS_ROLES),
    });
  } catch (error) {
    console.error("[API] GET /api/notifications/routing error:", error);
    return errorResponse("Could not read who hears about what");
  }
}
