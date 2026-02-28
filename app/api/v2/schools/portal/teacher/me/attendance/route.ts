import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";

const attendanceEntrySchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
  remarks: z.string().trim().max(300).optional(),
});

const attendancePayloadSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  attendanceDate: z.string().date(),
  notes: z.string().trim().max(500).optional(),
  entries: z.array(attendanceEntrySchema).min(1).max(400),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = attendancePayloadSchema.parse(body);

    const [term, schoolClass, stream] = await Promise.all([
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
      prisma.schoolClass.findFirst({
        where: { id: validated.classId, companyId },
        select: { id: true },
      }),
      validated.streamId
        ? prisma.schoolStream.findFirst({
            where: { id: validated.streamId, companyId },
            select: { id: true, classId: true },
          })
        : Promise.resolve(null),
    ]);
    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);
    if (validated.streamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (stream && stream.classId !== validated.classId) {
      return errorResponse("Selected stream does not belong to class", 400);
    }

    if (!isPrivilegedRole(session.user.role)) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) {
        return errorResponse("Active teacher profile is required for attendance capture", 403);
      }
      const assignment = await prisma.schoolClassSubject.findFirst({
        where: {
          companyId,
          teacherProfileId: profile.id,
          isActive: true,
          termId: validated.termId,
          classId: validated.classId,
          OR: [{ streamId: null }, { streamId: validated.streamId ?? null }],
        },
        select: { id: true },
      });
      if (!assignment) {
        return errorResponse("You are not assigned to this class/stream attendance scope", 403);
      }
    }

    const studentIds = [...new Set(validated.entries.map((entry) => entry.studentId))];
    const studentCount = await prisma.schoolStudent.count({
      where: {
        companyId,
        id: { in: studentIds },
        currentClassId: validated.classId,
        ...(validated.streamId ? { currentStreamId: validated.streamId } : {}),
      },
    });
    if (studentCount !== studentIds.length) {
      return errorResponse(
        "One or more students are outside the selected class/stream scope",
        400,
      );
    }

    const attendanceDate = new Date(validated.attendanceDate);
    const saved = await prisma.$transaction(async (tx) => {
      let sessionRow = await tx.schoolAttendanceSession.findFirst({
        where: {
          companyId,
          termId: validated.termId,
          classId: validated.classId,
          streamId: validated.streamId ?? null,
          attendanceDate,
        },
      });

      if (!sessionRow) {
        sessionRow = await tx.schoolAttendanceSession.create({
          data: {
            companyId,
            termId: validated.termId,
            classId: validated.classId,
            streamId: validated.streamId ?? null,
            attendanceDate,
            notes: validated.notes?.trim() || null,
            status: "DRAFT",
            createdByUserId: session.user.id,
          },
        });
      } else if (sessionRow.status === "LOCKED") {
        throw new Error("SESSION_LOCKED");
      }

      for (const entry of validated.entries) {
        await tx.schoolAttendanceSessionLine.upsert({
          where: {
            sessionId_studentId: {
              sessionId: sessionRow.id,
              studentId: entry.studentId,
            },
          },
          update: {
            status: entry.status,
            remarks: entry.remarks?.trim() || null,
          },
          create: {
            companyId,
            sessionId: sessionRow.id,
            studentId: entry.studentId,
            status: entry.status,
            remarks: entry.remarks?.trim() || null,
          },
        });
      }

      return sessionRow;
    });

    return successResponse({
      success: true,
      data: {
        resource: "portal-teacher-attendance",
        companyId,
        sessionId: saved.id,
        status: saved.status,
        entries: validated.entries.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Error && error.message === "SESSION_LOCKED") {
      return errorResponse("Attendance session is locked and cannot be updated", 409);
    }
    console.error("[API] POST /api/v2/schools/portal/teacher/me/attendance error:", error);
    return errorResponse("Failed to submit teacher attendance");
  }
}

