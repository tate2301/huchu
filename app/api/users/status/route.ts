import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

import {
  appendUserManagementEvent,
  canMutateUserManagement,
  isManagedRole,
} from "../_helpers";

const userStatusSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

async function applyStatusChange(request: NextRequest) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) return sessionResult;
  const { session } = sessionResult;

  if (!canMutateUserManagement(session)) {
    return errorResponse("Only SUPERADMIN can update user status.", 403);
  }

  const body = await request.json();
  const validated = userStatusSchema.parse(body);

  const existing = await prisma.user.findUnique({
    where: { id: validated.userId },
    select: { id: true, companyId: true, role: true, isActive: true, name: true, email: true },
  });

  if (!existing || existing.companyId !== session.user.companyId) {
    return errorResponse("User not found for this organization.", 404);
  }

  if (!isManagedRole(existing.role)) {
    return errorResponse("Only MANAGER and CLERK accounts can be managed here.", 403);
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { isActive: validated.isActive },
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

  await appendUserManagementEvent({
    companyId: session.user.companyId,
    actorId: session.user.id,
    actorRole: session.user.role,
    eventType: "USER_SET_STATUS",
    message: `Updated status for ${updated.email}: ${String(existing.isActive)} -> ${String(updated.isActive)}`,
    payload: {
      userId: updated.id,
      beforeIsActive: existing.isActive,
      afterIsActive: updated.isActive,
    },
  });

  return successResponse(updated);
}

export async function POST(request: NextRequest) {
  try {
    return await applyStatusChange(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/users/status error:", error);
    return errorResponse("Failed to update user status");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await applyStatusChange(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/users/status error:", error);
    return errorResponse("Failed to update user status");
  }
}
