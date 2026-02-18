import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { clearUserFeatureOverrides } from "@/lib/platform/user-entitlements";
import { prisma } from "@/lib/prisma";

import {
  appendUserManagementEvent,
  canMutateUserManagement,
  isManagedRole,
  managedRoleSchema,
} from "../_helpers";

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  role: managedRoleSchema,
});

async function applyRoleChange(request: NextRequest) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) return sessionResult;
  const { session } = sessionResult;

  if (!canMutateUserManagement(session)) {
    return errorResponse("Only SUPERADMIN can change user roles.", 403);
  }

  const body = await request.json();
  const validated = roleChangeSchema.parse(body);

  const existing = await prisma.user.findUnique({
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

  if (!existing || existing.companyId !== session.user.companyId) {
    return errorResponse("User not found for this organization.", 404);
  }

  if (!isManagedRole(existing.role)) {
    return errorResponse("Only MANAGER and CLERK accounts can be managed here.", 403);
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { role: validated.role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await clearUserFeatureOverrides(updated.id);

  await appendUserManagementEvent({
    companyId: session.user.companyId,
    actorId: session.user.id,
    actorRole: session.user.role,
    eventType: "USER_CHANGE_ROLE",
    message: `Changed role for ${updated.email}: ${existing.role} -> ${updated.role}`,
    payload: {
      userId: updated.id,
      beforeRole: existing.role,
      afterRole: updated.role,
    },
  });

  return successResponse(updated);
}

export async function POST(request: NextRequest) {
  try {
    return await applyRoleChange(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/users/role-change error:", error);
    return errorResponse("Failed to change user role");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await applyRoleChange(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/users/role-change error:", error);
    return errorResponse("Failed to change user role");
  }
}
