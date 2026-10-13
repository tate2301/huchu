import { NextRequest, NextResponse } from "next/server";

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";
import { readVaneSettings, settingsPatchSchema, updateVaneSettings, watchablesFor } from "@/lib/vane/settings";
import { USER_ROLE_LABELS, VERTICAL_ROLE_REGISTRY } from "@/lib/platform/vertical-role-registry";

/** The roles a workspace of this profile has, named in sentence case. */
function rolesFor(profile: string | null | undefined) {
  const registry = VERTICAL_ROLE_REGISTRY as Record<string, { roles: string[] }>;
  const roles = (profile && registry[profile]?.roles) || registry.GENERAL.roles;
  return roles.map((role) => {
    const label = (USER_ROLE_LABELS as Record<string, string | undefined>)[role] ?? role;
    return { role, label: label.charAt(0) + label.slice(1).toLowerCase() };
  });
}

/** Management → Vane: the settings, what the workspace runs, and this month's figures. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const [settings, company] = await Promise.all([
      readVaneSettings(prisma, session.user.companyId),
      prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } }),
    ]);
    return successResponse({
      settings,
      workspaceName: company?.name ?? "this workspace",
      watchables: watchablesFor(session.user.enabledFeatures),
      roles: rolesFor(session.user.workspaceProfile),
      canChange: hasRole(session, VANE_SETTINGS_ROLES),
    });
  } catch (error) {
    console.error("[API] GET /api/vane/settings error:", error);
    return errorResponse("Could not read Vane's settings");
  }
}

/**
 * Change what Vane watches and does, its quiet hours and who hears about
 * what, or pause it. Paused stops new jobs; what it raised stays readable.
 * "Send, pay, save or change" is not a setting: it always asks.
 */
export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, VANE_SETTINGS_ROLES)) {
      return errorResponse("Only a manager can change Vane", 403);
    }
    const body = settingsPatchSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Those settings are not right", 400);
    await updateVaneSettings(prisma, session.user.companyId, body.data);
    return successResponse(await readVaneSettings(prisma, session.user.companyId));
  } catch (error) {
    console.error("[API] PATCH /api/vane/settings error:", error);
    return errorResponse("Could not change Vane's settings");
  }
}
