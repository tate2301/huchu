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
      return errorResponse("Invalid teacher ID", 400);
    }

    const teacher = await prisma.schoolTeacherProfile.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            isActive: true,
          },
        },
        assignments: {
          include: {
            term: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, code: true, name: true } },
            stream: { select: { id: true, code: true, name: true } },
            subject: { select: { id: true, code: true, name: true, isCore: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    if (!teacher) {
      return errorResponse("Teacher not found", 404);
    }

    return successResponse(teacher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/teachers/[id] error:", error);
    return errorResponse("Failed to fetch teacher profile");
  }
}
