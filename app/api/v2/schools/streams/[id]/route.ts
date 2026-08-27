import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { isUniqueConstraintError } from "../../_helpers";

const updateStreamSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    capacity: z.number().int().positive().nullable().optional(),
    termId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const streamSelect = {
  id: true,
  code: true,
  name: true,
  capacity: true,
  classId: true,
  termId: true,
  class: { select: { id: true, code: true, name: true, level: true } },
  _count: { select: { students: true, enrollments: true } },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid stream ID", 400);

    const stream = await prisma.schoolStream.findFirst({
      where: { id, companyId: session.user.companyId },
      select: streamSelect,
    });
    if (!stream) return errorResponse("Stream not found", 404);

    return successResponse(stream);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/streams/[id] error:", error);
    return errorResponse("Failed to fetch stream");
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

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid stream ID", 400);

    const existing = await prisma.schoolStream.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Stream not found", 404);

    const validated = updateStreamSchema.parse(await request.json());

    if (validated.termId) {
      const term = await prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      });
      if (!term) return errorResponse("Invalid term for this company", 400);
    }

    const updated = await prisma.schoolStream.update({
      where: { id: existing.id },
      data: {
        ...(validated.code !== undefined ? { code: validated.code } : {}),
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.capacity !== undefined ? { capacity: validated.capacity } : {}),
        ...(validated.termId !== undefined ? { termId: validated.termId } : {}),
      },
      select: streamSelect,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("This class already has a stream with that code", 409);
    }
    console.error("[API] PATCH /api/v2/schools/streams/[id] error:", error);
    return errorResponse("Failed to update stream");
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

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid stream ID", 400);

    const existing = await prisma.schoolStream.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            students: true,
            enrollments: true,
            resultSheets: true,
            classSubjects: true,
            timetableSlots: true,
            publishWindows: true,
          },
        },
      },
    });
    if (!existing) return errorResponse("Stream not found", 404);

    // Same rule as the class route: the FKs would either cascade or null out,
    // and a stream deleted under a pupil is a pupil in no set at all. Refuse
    // and name what is holding it, so the office knows what to move first.
    const inUseBy = Object.fromEntries(
      Object.entries(existing._count).filter(([, count]) => count > 0),
    );
    if (Object.keys(inUseBy).length > 0) {
      return errorResponse(
        `${existing.name} still has records attached to it`,
        409,
        { inUseBy },
      );
    }

    await prisma.schoolStream.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/streams/[id] error:", error);
    return errorResponse("Failed to delete stream");
  }
}
