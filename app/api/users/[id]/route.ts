import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { countOverrides, getUserPermissionCatalog } from "@/lib/platform/permission-catalog";
import { findLastSignInAt } from "@/lib/auth-core/last-sign-in";

import {
  appendUserManagementEvent,
  canManageUserPermissions,
  canMutateUserManagement,
  canViewUserManagement,
} from "../_helpers";

/**
 * Everything about one person, in one place.
 *
 * The directory answers "who is here"; this answers "who is this, what may
 * they do, and what have they done" — which is the question somebody actually
 * has when they open a user's row. Splitting those three across three screens
 * is how an admin ends up suspending the wrong account.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canViewUserManagement(session)) {
      return errorResponse("Insufficient permissions to view users", 403);
    }

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        companyId: true,
        createdAt: true,
        updatedAt: true,
        passwordChangedAt: true,
        phone: true,
        image: true,
      },
    });

    if (!user || user.companyId !== session.user.companyId) {
      return errorResponse("User not found for this organization.", 404);
    }

    // The permission catalogue and the sign-in read do not depend on each
    // other, so they go out together rather than one after the other.
    const [groups, lastSignInAt] = await Promise.all([
      canManageUserPermissions(session)
        ? getUserPermissionCatalog({
            companyId: session.user.companyId,
            userId: user.id,
            role: user.role,
          })
        : Promise.resolve([]),
      findLastSignInAt({ companyId: session.user.companyId, email: user.email }),
    ]);

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        // Last **sign-in**, not last seen: a session outlives the moment it was
        // opened and nothing records the difference. Null means this account
        // has never signed in, which is a fact worth drawing rather than a gap.
        lastSignInAt: lastSignInAt ? lastSignInAt.toISOString() : null,
        passwordChangedAt: user.passwordChangedAt
          ? user.passwordChangedAt.toISOString()
          : null,
        phone: user.phone,
        image: user.image,
      },
      groups,
      overrideCount: countOverrides(groups),
      canEditPermissions: canManageUserPermissions(session) && user.id !== session.user.id,
      canMutateAccount: canMutateUserManagement(session) && user.id !== session.user.id,
    });
  } catch (error) {
    console.error("[API] GET /api/users/[id] error:", error);
    return errorResponse("Failed to load user");
  }
}

/**
 * Deleting somebody is the last resort, and the database usually says no.
 *
 * A user who has approved a payout or signed off a shift is referenced by
 * those records, and removing the row would leave the history unattributable.
 * When that happens the honest answer is "suspend them instead", said in those
 * words, rather than a foreign-key error the admin has to interpret.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canMutateUserManagement(session)) {
      return errorResponse("Only SUPERADMIN can delete a user account.", 403);
    }

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, companyId: true, email: true, role: true },
    });

    if (!user || user.companyId !== session.user.companyId) {
      return errorResponse("User not found for this organization.", 404);
    }

    if (user.id === session.user.id) {
      return errorResponse("You cannot delete your own account.", 400);
    }

    if (user.role === "SUPERADMIN") {
      const remainingAdmins = await prisma.user.count({
        where: {
          companyId: session.user.companyId,
          role: "SUPERADMIN",
          isActive: true,
          id: { not: user.id },
        },
      });
      if (remainingAdmins === 0) {
        return errorResponse(
          "This is the last active superadmin. Promote somebody else first.",
          400,
        );
      }
    }

    try {
      await prisma.user.delete({ where: { id: user.id } });
    } catch {
      return errorResponse(
        "This account is referenced by records that must keep their history. Suspend it instead.",
        409,
      );
    }

    await appendUserManagementEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventType: "USER_DELETE",
      message: `Deleted user ${user.email}`,
      payload: { userId: user.id, targetRole: user.role },
    });

    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/users/[id] error:", error);
    return errorResponse("Failed to delete user");
  }
}
