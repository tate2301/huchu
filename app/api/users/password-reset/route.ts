import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

import {
  appendUserManagementEvent,
  canMutateUserManagement,
  isManagedRole,
} from "../_helpers";

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canMutateUserManagement(session)) {
      return errorResponse("Only SUPERADMIN can reset user passwords.", 403);
    }

    const body = await request.json();
    const validated = resetPasswordSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { id: validated.userId },
      select: { id: true, companyId: true, role: true, email: true },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("User not found for this organization.", 404);
    }

    if (!isManagedRole(existing.role)) {
      return errorResponse("Only MANAGER and CLERK accounts can be managed here.", 403);
    }

    const passwordHash = await bcrypt.hash(validated.newPassword, 12);
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { password: passwordHash },
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
      eventType: "USER_RESET_PASSWORD",
      message: `Reset password for ${updated.email}`,
      payload: {
        userId: updated.id,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/users/password-reset error:", error);
    return errorResponse("Failed to reset user password");
  }
}
