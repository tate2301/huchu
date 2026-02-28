import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

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
      include: {
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
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            studentLinks: true,
          },
        },
      },
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
