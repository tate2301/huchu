import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateWindowSchema = z.object({
  status: z.enum(["SCHEDULED", "OPEN", "CLOSED"]).optional(),
  openAt: z.string().datetime().optional(),
  closeAt: z.string().datetime().optional(),
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
  streamId: z.string().uuid().nullable().optional(),
});

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

    const body = await request.json();
    const validated = updateWindowSchema.parse(body);

    const existing = await prisma.schoolPublishWindow.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        termId: true,
        classId: true,
        streamId: true,
        openAt: true,
        closeAt: true,
      },
    });
    if (!existing) {
      return errorResponse("Publish window not found", 404);
    }

    const nextOpenAt = validated.openAt ? new Date(validated.openAt) : existing.openAt;
    const nextCloseAt = validated.closeAt ? new Date(validated.closeAt) : existing.closeAt;
    if (nextCloseAt <= nextOpenAt) {
      return errorResponse("closeAt must be after openAt", 400);
    }

    const nextClassId =
      validated.classId !== undefined ? validated.classId : existing.classId;
    const nextStreamId =
      validated.streamId !== undefined ? validated.streamId : existing.streamId;

    const [schoolClass, stream] = await Promise.all([
      nextClassId
        ? prisma.schoolClass.findFirst({
            where: { id: nextClassId, companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
      nextStreamId
        ? prisma.schoolStream.findFirst({
            where: { id: nextStreamId, companyId },
            select: { id: true, classId: true },
          })
        : Promise.resolve(null),
    ]);

    if (nextClassId && !schoolClass) {
      return errorResponse("Invalid class for this company", 400);
    }
    if (nextStreamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (nextStreamId && !nextClassId) {
      return errorResponse("classId is required when streamId is provided", 400);
    }
    if (stream && nextClassId && stream.classId !== nextClassId) {
      return errorResponse("Selected stream does not belong to class", 400);
    }

    const updated = await prisma.schoolPublishWindow.update({
      where: { id: existing.id },
      data: {
        ...(validated.status ? { status: validated.status } : {}),
        ...(validated.openAt ? { openAt: nextOpenAt } : {}),
        ...(validated.closeAt ? { closeAt: nextCloseAt } : {}),
        ...(validated.classId !== undefined ? { classId: validated.classId } : {}),
        ...(validated.streamId !== undefined ? { streamId: validated.streamId } : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes?.trim() || null } : {}),
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/results/publish/windows/[id] error:", error);
    return errorResponse("Failed to update publish window");
  }
}
