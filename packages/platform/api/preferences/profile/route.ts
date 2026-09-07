import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "../../../api-utils";
import { prisma } from "@corelithzw/db/client";

const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(60).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field is required",
  });

const profileSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  role: true,
  isActive: true,
  company: {
    select: {
      id: true,
      name: true,
      slug: true,
      tenantStatus: true,
      workspaceProfile: true,
    },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: profileSelect,
    });

    if (!user || user.company.id !== session.user.companyId) {
      return errorResponse("Profile not found", 404);
    }

    return successResponse(user);
  } catch (error) {
    console.error("[API] GET /api/preferences/profile error:", error);
    return errorResponse("Failed to fetch profile");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = profileUpdateSchema.parse(body);

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: validated.name,
        phone:
          validated.phone === undefined
            ? undefined
            : validated.phone === null
              ? null
              : validated.phone.trim() || null,
      },
      select: profileSelect,
    });

    if (user.company.id !== session.user.companyId) {
      return errorResponse("Profile not found", 404);
    }

    return successResponse(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/preferences/profile error:", error);
    return errorResponse("Failed to update profile");
  }
}
