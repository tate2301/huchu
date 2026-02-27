import { NextRequest, NextResponse } from "next/server";
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
      return errorResponse("Invalid class ID", 400);
    }

    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        streams: {
          select: {
            id: true,
            code: true,
            name: true,
            capacity: true,
          },
          orderBy: { name: "asc" },
        },
        classSubjects: {
          include: {
            subject: {
              select: {
                id: true,
                code: true,
                name: true,
                isCore: true,
                passMark: true,
                isActive: true,
              },
            },
            stream: {
              select: { id: true, code: true, name: true },
            },
            teacherProfile: {
              select: {
                id: true,
                employeeCode: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            streams: true,
            students: true,
          },
        },
      },
    });

    if (!schoolClass) {
      return errorResponse("Class not found", 404);
    }

    return successResponse(schoolClass);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/classes/[id] error:", error);
    return errorResponse("Failed to fetch class");
  }
}
