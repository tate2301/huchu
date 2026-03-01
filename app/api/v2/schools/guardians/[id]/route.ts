import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { normalizeProvidedId } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
} from "../../_helpers";

const updateGuardianSchema = z
  .object({
    guardianNo: z.string().trim().min(1).max(40).optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(3).max(50).optional(),
    email: z.string().trim().email().nullable().optional(),
    address: z.string().trim().min(1).max(500).nullable().optional(),
    nationalId: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const guardianDetailInclude = {
  studentLinks: {
    include: {
      student: {
        select: {
          id: true,
          studentNo: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          status: true,
          currentClass: { select: { id: true, code: true, name: true } },
          currentStream: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  _count: {
    select: {
      studentLinks: true,
    },
  },
} satisfies Prisma.SchoolGuardianInclude;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid guardian ID", 400);
    }

    const guardian = await prisma.schoolGuardian.findFirst({
      where: { id, companyId: session.user.companyId },
      include: guardianDetailInclude,
    });

    if (!guardian) {
      return errorResponse("Guardian not found", 404);
    }

    return successResponse(guardian);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/guardians/[id] error:", error);
    return errorResponse("Failed to fetch guardian profile");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid guardian ID", 400);
    }

    const body = await request.json();
    const validated = updateGuardianSchema.parse(body);

    const existing = await prisma.schoolGuardian.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse("Guardian not found", 404);
    }

    let normalizedGuardianNo: string | undefined;
    if (validated.guardianNo !== undefined) {
      try {
        normalizedGuardianNo = normalizeProvidedId(
          validated.guardianNo,
          "SCHOOL_GUARDIAN",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid guardian number format";
        return errorResponse(message, 400);
      }
    }

    const updated = await prisma.schoolGuardian.update({
      where: { id: existing.id },
      data: {
        ...(normalizedGuardianNo !== undefined
          ? { guardianNo: normalizedGuardianNo }
          : {}),
        ...(validated.firstName !== undefined ? { firstName: validated.firstName } : {}),
        ...(validated.lastName !== undefined ? { lastName: validated.lastName } : {}),
        ...(validated.phone !== undefined ? { phone: validated.phone } : {}),
        ...(validated.email !== undefined
          ? { email: normalizeOptionalNullableString(validated.email) ?? null }
          : {}),
        ...(validated.address !== undefined
          ? { address: normalizeOptionalNullableString(validated.address) ?? null }
          : {}),
        ...(validated.nationalId !== undefined
          ? { nationalId: normalizeOptionalNullableString(validated.nationalId) ?? null }
          : {}),
      },
      include: guardianDetailInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Guardian number already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/guardians/[id] error:", error);
    return errorResponse("Failed to update guardian profile");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid guardian ID", 400);
    }

    const existing = await prisma.schoolGuardian.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        _count: {
          select: {
            studentLinks: true,
          },
        },
      },
    });
    if (!existing) {
      return errorResponse("Guardian not found", 404);
    }

    if (existing._count.studentLinks > 0) {
      return errorResponse(
        "Cannot delete guardian because it is linked to students",
        409,
      );
    }

    await prisma.schoolGuardian.delete({
      where: { id: existing.id },
    });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return errorResponse("Cannot delete guardian because it is linked to students", 409);
    }
    console.error("[API] DELETE /api/v2/schools/guardians/[id] error:", error);
    return errorResponse("Failed to delete guardian");
  }
}
