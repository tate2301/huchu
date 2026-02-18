import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { clearUserFeatureOverrides } from "@/lib/platform/user-entitlements";

import {
  appendUserManagementEvent,
  canMutateUserManagement,
  isManagedRole,
} from "../../_helpers";

const resetFeatureAccessSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canMutateUserManagement(session)) {
      return errorResponse("Only SUPERADMIN can reset per-user feature access.", 403);
    }

    const body = await request.json();
    const validated = resetFeatureAccessSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: validated.userId },
      select: {
        id: true,
        companyId: true,
        role: true,
        name: true,
        email: true,
        isActive: true,
      },
    });

    if (!user || user.companyId !== session.user.companyId) {
      return errorResponse("User not found for this organization.", 404);
    }
    if (!isManagedRole(user.role)) {
      return errorResponse("Only MANAGER and CLERK accounts can be managed here.", 403);
    }

    await clearUserFeatureOverrides(user.id);

    await appendUserManagementEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventType: "USER_RESET_FEATURE_ACCESS",
      message: `Reset feature access overrides for ${user.email}`,
      payload: {
        userId: user.id,
        targetRole: user.role,
      },
    });

    return successResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/users/access/reset error:", error);
    return errorResponse("Failed to reset user feature access");
  }
}
