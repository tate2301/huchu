import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  getManagedUserFeatureAccessEntries,
  setManagedUserFeatureOverride,
} from "@/lib/platform/user-entitlements";

import {
  appendUserManagementEvent,
  canMutateUserManagement,
  isManagedRole,
} from "../_helpers";

const setFeatureAccessSchema = z.object({
  userId: z.string().uuid(),
  featureKey: z.string().trim().min(1).max(200),
  isEnabled: z.boolean(),
});

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

async function getManagedUserForCompany(userId: string, companyId: string) {
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

  if (!user || user.companyId !== companyId) {
    return null;
  }

  return user;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canMutateUserManagement(session)) {
      return errorResponse("Only SUPERADMIN can manage per-user feature access.", 403);
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim();
    if (!userId) {
      return errorResponse("Missing required query parameter: userId", 400);
    }

    const user = await getManagedUserForCompany(userId, session.user.companyId);
    if (!user) {
      return errorResponse("User not found for this organization.", 404);
    }
    if (!isManagedRole(user.role)) {
      return errorResponse("Only MANAGER and CLERK accounts can be managed here.", 403);
    }

    const features = await getManagedUserFeatureAccessEntries({
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
      features,
    });
  } catch (error) {
    console.error("[API] GET /api/users/access error:", error);
    return errorResponse("Failed to load user feature access");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canMutateUserManagement(session)) {
      return errorResponse("Only SUPERADMIN can manage per-user feature access.", 403);
    }

    const body = await request.json();
    const validated = setFeatureAccessSchema.parse(body);

    const user = await getManagedUserForCompany(validated.userId, session.user.companyId);
    if (!user) {
      return errorResponse("User not found for this organization.", 404);
    }
    if (!isManagedRole(user.role)) {
      return errorResponse("Only MANAGER and CLERK accounts can be managed here.", 403);
    }

    try {
      await setManagedUserFeatureOverride({
        companyId: session.user.companyId,
        userId: user.id,
        role: user.role,
        featureKey: validated.featureKey,
        isEnabled: validated.isEnabled,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "FEATURE_NOT_ENABLED_FOR_COMPANY") {
        return errorResponse("Feature is not enabled for this company.", 400);
      }
      if (message === "FEATURE_BLOCKED_BY_TEMPLATE") {
        return errorResponse("Feature is blocked by the selected role template.", 400);
      }
      throw error;
    }

    const normalizedFeatureKey = normalizeFeatureKey(validated.featureKey);
    const features = await getManagedUserFeatureAccessEntries({
      companyId: session.user.companyId,
      userId: user.id,
      role: user.role,
    });
    const updatedFeature = features.find(
      (entry) => entry.featureKey === normalizedFeatureKey,
    );

    await appendUserManagementEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventType: "USER_SET_FEATURE_ACCESS",
      message: `${validated.isEnabled ? "Enabled" : "Disabled"} feature ${normalizedFeatureKey} for ${user.email}`,
      payload: {
        userId: user.id,
        targetRole: user.role,
        featureKey: normalizedFeatureKey,
        isEnabled: validated.isEnabled,
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
      feature: updatedFeature ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/users/access error:", error);
    return errorResponse("Failed to update user feature access");
  }
}
