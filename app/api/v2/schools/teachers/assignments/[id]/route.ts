import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateAssignmentSchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().optional(),
  teacherProfileId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
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
    const validated = updateAssignmentSchema.parse(body);

    const existing = await prisma.schoolClassSubject.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        termId: true,
        classId: true,
        streamId: true,
        subjectId: true,
        teacherProfileId: true,
      },
    });
    if (!existing) {
      return errorResponse("Assignment not found", 404);
    }

    const nextValues = {
      termId: validated.termId ?? existing.termId,
      classId: validated.classId ?? existing.classId,
      streamId:
        validated.streamId !== undefined ? validated.streamId : existing.streamId,
      subjectId: validated.subjectId ?? existing.subjectId,
      teacherProfileId: validated.teacherProfileId ?? existing.teacherProfileId,
    };

    const [term, schoolClass, stream, subject, teacherProfile] = await Promise.all([
      prisma.schoolTerm.findFirst({
        where: { id: nextValues.termId, companyId },
        select: { id: true },
      }),
      prisma.schoolClass.findFirst({
        where: { id: nextValues.classId, companyId },
        select: { id: true },
      }),
      nextValues.streamId
        ? prisma.schoolStream.findFirst({
            where: { id: nextValues.streamId, companyId },
            select: { id: true, classId: true },
          })
        : Promise.resolve(null),
      prisma.schoolSubject.findFirst({
        where: { id: nextValues.subjectId, companyId },
        select: { id: true },
      }),
      prisma.schoolTeacherProfile.findFirst({
        where: { id: nextValues.teacherProfileId, companyId },
        select: { id: true },
      }),
    ]);

    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);
    if (!subject) return errorResponse("Invalid subject for this company", 400);
    if (!teacherProfile) return errorResponse("Invalid teacher profile for this company", 400);
    if (nextValues.streamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (stream && stream.classId !== nextValues.classId) {
      return errorResponse("Selected stream does not belong to class", 400);
    }

    const updated = await prisma.schoolClassSubject.update({
      where: { id: existing.id },
      data: {
        termId: nextValues.termId,
        classId: nextValues.classId,
        streamId: nextValues.streamId,
        subjectId: nextValues.subjectId,
        teacherProfileId: nextValues.teacherProfileId,
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
        subject: { select: { id: true, code: true, name: true, isCore: true, passMark: true } },
        teacherProfile: {
          select: {
            id: true,
            employeeCode: true,
            isClassTeacher: true,
            isHod: true,
            isActive: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/teachers/assignments/[id] error:", error);
    return errorResponse("Failed to update class-subject assignment");
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

    const existing = await prisma.schoolClassSubject.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse("Assignment not found", 404);
    }

    await prisma.schoolClassSubject.delete({
      where: { id: existing.id },
    });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/teachers/assignments/[id] error:", error);
    return errorResponse("Failed to delete class-subject assignment");
  }
}
