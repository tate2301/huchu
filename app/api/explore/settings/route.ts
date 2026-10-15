import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { exploreSettingsView } from "@/lib/explore/settings";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { prisma } from "@/lib/prisma";

/** Management → Explore: who can use it, what each product shows, and the guards. Read only until its settings are approved. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isOrgAdminRole(session.user.role)) return errorResponse("Only owners and managers see who uses Explore", 403);
    const [company, users] = await Promise.all([
      prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } }),
      prisma.user.findMany({ where: { companyId: session.user.companyId, isActive: true }, select: { name: true, role: true }, orderBy: { name: "asc" } }),
    ]);
    return successResponse(
      exploreSettingsView({
        workspaceName: company?.name ?? "this workspace",
        profile: session.user.workspaceProfile,
        enabledFeatures: session.user.enabledFeatures,
        users,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/explore/settings error:", error);
    return errorResponse("Could not read Explore's settings");
  }
}
