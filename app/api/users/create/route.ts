import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

import {
  appendUserManagementEvent,
  canMutateUserManagement,
  managedRoleSchema,
  normalizeEmail,
} from "../_helpers";

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  role: managedRoleSchema,
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canMutateUserManagement(session)) {
      return errorResponse("Only SUPERADMIN can create users.", 403);
    }

    const body = await request.json();
    const validated = createUserSchema.parse(body);

    const email = normalizeEmail(validated.email);
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existing) {
      return errorResponse("A user with this email already exists.", 409);
    }

    const passwordHash = await bcrypt.hash(validated.password, 12);
    const user = await prisma.user.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name.trim(),
        email,
        password: passwordHash,
        role: validated.role,
        isActive: true,
      },
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
      eventType: "USER_CREATE",
      message: `Created ${user.role} user ${user.email}`,
      payload: {
        userId: user.id,
        targetRole: user.role,
        targetActive: user.isActive,
      },
    });

    return successResponse(user, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/users/create error:", error);
    return errorResponse("Failed to create user");
  }
}
