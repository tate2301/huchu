import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  countOverrides,
  getUserPermissionCatalog,
  PERMISSION_STATES,
  resetUserPermissions,
} from "@/lib/platform/permission-catalog";
import { changeUserPermission, PermissionChangeRefused } from "@/lib/platform/change-permission";
import { clearUserFeatureOverrides } from "@/lib/platform/user-entitlements";

import { canManageUserPermissions } from "../_helpers";
import { appendUserManagementEvent } from "@/lib/platform/user-management-events";

const setPermissionSchema = z.object({
  userId: z.string().uuid(),
  kind: z.enum(["FEATURE", "CAPABILITY"]),
  key: z.string().trim().min(1).max(200),
  state: z.enum(PERMISSION_STATES),
});

const resetSchema = z.object({
  userId: z.string().uuid(),
});

async function loadTarget(userId: string, companyId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      companyId: true,
      role: true,
      name: true,
      email: true,
      isActive: true,
    },
  });

  if (!user || user.companyId !== companyId) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canManageUserPermissions(session)) {
      return errorResponse("Only an admin or manager can view user permissions.", 403);
    }

    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) {
      return errorResponse("Missing required query parameter: userId", 400);
    }

    const user = await loadTarget(userId, session.user.companyId);
    if (!user) {
      return errorResponse("User not found for this organization.", 404);
    }

    const groups = await getUserPermissionCatalog({
      companyId: session.user.companyId,
      userId: user.id,
      role: user.role,
    });

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      groups,
      overrideCount: countOverrides(groups),
      // Superadmins hold the keys; a manager can shape a rep's access but not
      // hand out the ability to hand out access.
      canEdit: session.user.role === "SUPERADMIN" || session.user.role === "MANAGER",
    });
  } catch (error) {
    console.error("[API] GET /api/users/permissions error:", error);
    return errorResponse("Failed to load user permissions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const validated = setPermissionSchema.parse(await request.json());
    const changed = await changeUserPermission({ companyId: session.user.companyId, userId: session.user.id, role: session.user.role }, validated);
    return successResponse({ groups: changed.groups, overrideCount: changed.overrideCount, permission: changed.permission });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof PermissionChangeRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/users/permissions error:", error);
    return errorResponse("Failed to update user permissions");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canManageUserPermissions(session)) {
      return errorResponse("Only an admin or manager can reset user permissions.", 403);
    }

    const validated = resetSchema.parse(await request.json());
    const user = await loadTarget(validated.userId, session.user.companyId);
    if (!user) {
      return errorResponse("User not found for this organization.", 404);
    }
    if (user.id === session.user.id) {
      return errorResponse("You cannot reset your own permissions.", 400);
    }

    await Promise.all([
      resetUserPermissions(user.id),
      clearUserFeatureOverrides(user.id),
    ]);

    const groups = await getUserPermissionCatalog({
      companyId: session.user.companyId,
      userId: user.id,
      role: user.role,
    });

    await appendUserManagementEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventType: "USER_RESET_FEATURE_ACCESS",
      message: `Reset all permission overrides for ${user.email}`,
      payload: { userId: user.id, targetRole: user.role },
    });

    return successResponse({ groups, overrideCount: countOverrides(groups) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] DELETE /api/users/permissions error:", error);
    return errorResponse("Failed to reset user permissions");
  }
}
