import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "../../_helpers";

const updateClassSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    level: z.number().int().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
    termId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const classDetailInclude = {
  streams: {
    select: {
      id: true,
      code: true,
      name: true,
      capacity: true,
    },
    orderBy: { name: "asc" as const },
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
    orderBy: { createdAt: "asc" as const },
  },
  _count: {
    select: {
      streams: true,
      students: true,
    },
  },
};

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
      include: classDetailInclude,
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
      return errorResponse("Invalid class ID", 400);
    }

    const body = await request.json();
    const validated = updateClassSchema.parse(body);

    const existing = await prisma.schoolClass.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse("Class not found", 404);
    }

    if (validated.termId) {
      const term = await prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      });
      if (!term) {
        return errorResponse("Invalid term for this company", 400);
      }
    }

    const updated = await prisma.schoolClass.update({
      where: { id: existing.id },
      data: {
        ...(validated.code !== undefined ? { code: validated.code } : {}),
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.level !== undefined ? { level: validated.level } : {}),
        ...(validated.capacity !== undefined ? { capacity: validated.capacity } : {}),
        ...(validated.termId !== undefined ? { termId: validated.termId } : {}),
      },
      include: classDetailInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A class with this code already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/classes/[id] error:", error);
    return errorResponse("Failed to update class");
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
      return errorResponse("Invalid class ID", 400);
    }

    const existing = await prisma.schoolClass.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        _count: {
          select: {
            streams: true,
            students: true,
            enrollments: true,
            resultSheets: true,
            classSubjects: true,
            publishWindows: true,
            feeStructures: true,
          },
        },
      },
    });
    if (!existing) {
      return errorResponse("Class not found", 404);
    }

    const dependencyCounts = {
      streams: existing._count.streams,
      students: existing._count.students,
      enrollments: existing._count.enrollments,
      resultSheets: existing._count.resultSheets,
      classSubjects: existing._count.classSubjects,
      publishWindows: existing._count.publishWindows,
      feeStructures: existing._count.feeStructures,
    };
    const inUseBy = Object.fromEntries(
      Object.entries(dependencyCounts).filter(([, count]) => count > 0),
    );

    if (Object.keys(inUseBy).length > 0) {
      return errorResponse(
        "Cannot delete class because related records exist",
        409,
        { inUseBy },
      );
    }

    await prisma.schoolClass.delete({
      where: { id: existing.id },
    });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/classes/[id] error:", error);
    return errorResponse("Failed to delete class");
  }
}
