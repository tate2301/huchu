import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  countOverrides,
  getUserPermissionCatalog,
  PERMISSION_STATES,
  resetUserPermissions,
  setUserPermission,
} from "@/lib/platform/permission-catalog";
import { clearUserFeatureOverrides } from "@/lib/platform/user-entitlements";

import { appendUserManagementEvent, canManageUserPermissions } from "../_helpers";

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

    if (!canManageUserPermissions(session)) {
      return errorResponse("Only an admin or manager can change user permissions.", 403);
    }

    const validated = setPermissionSchema.parse(await request.json());

    const user = await loadTarget(validated.userId, session.user.companyId);
    if (!user) {
      return errorResponse("User not found for this organization.", 404);
    }

    // Somebody editing their own permissions can only ever go one way in
    // practice, and it is the way that removes the check that stopped them.
    if (user.id === session.user.id) {
      return errorResponse("You cannot change your own permissions.", 400);
    }

    if (user.role === "SUPERADMIN" && session.user.role !== "SUPERADMIN") {
      return errorResponse("Only a superadmin can change a superadmin's permissions.", 403);
    }

    try {
      await setUserPermission({
        companyId: session.user.companyId,
        userId: user.id,
        role: user.role,
        kind: validated.kind,
        key: validated.key,
        state: validated.state,
        actorId: session.user.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "FEATURE_NOT_ENABLED_FOR_COMPANY") {
        return errorResponse("That feature is not enabled for this company.", 400);
      }
      if (message === "UNKNOWN_PERMISSION_KEY") {
        return errorResponse("Unknown permission.", 400);
      }
      throw error;
    }

    const groups = await getUserPermissionCatalog({
      companyId: session.user.companyId,
      userId: user.id,
      role: user.role,
    });
    const updated = groups
      .flatMap((group) => group.entries)
      .find((entry) => entry.kind === validated.kind && entry.key === validated.key);

    await appendUserManagementEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventType: "USER_SET_PERMISSION",
      message: `Set ${validated.key} to ${validated.state.toLowerCase()} for ${user.email}`,
      payload: {
        userId: user.id,
        targetRole: user.role,
        permissionKey: validated.key,
        permissionKind: validated.kind,
        state: validated.state,
      },
    });

    return successResponse({
      groups,
      overrideCount: countOverrides(groups),
      permission: updated ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
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
