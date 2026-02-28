import { NextRequest, NextResponse } from "next/server";
import {
  Prisma,
  SchoolAttendanceEntryStatus,
  SchoolAttendanceSessionStatus,
} from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";

const attendanceEntryStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
const attendanceSessionStatusSchema = z.enum(["DRAFT", "SUBMITTED", "LOCKED"]);

const attendanceSessionsQuerySchema = z.object({
  status: attendanceSessionStatusSchema.optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  search: z.string().trim().min(1).optional(),
});

const createAttendanceSessionSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  attendanceDate: z.string().date(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: attendanceEntryStatusSchema,
        remarks: z.string().trim().max(300).optional(),
      }),
    )
    .optional(),
});

async function ensureSessionCreatePermission(input: {
  companyId: string;
  userId: string;
  role: string;
  termId: string;
  classId: string;
  streamId: string | null;
}) {
  if (isPrivilegedRole(input.role)) return;

  const teacherProfile = await getTeacherProfile(input.companyId, input.userId);
  if (!teacherProfile) {
    throw new Error("TEACHER_PROFILE_REQUIRED");
  }
  const assignment = await prisma.schoolClassSubject.findFirst({
    where: {
      companyId: input.companyId,
      teacherProfileId: teacherProfile.id,
      isActive: true,
      termId: input.termId,
      classId: input.classId,
      OR: [{ streamId: null }, { streamId: input.streamId }],
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new Error("ATTENDANCE_SCOPE_NOT_ASSIGNED");
  }
}

async function mapSessionPresentation(
  companyId: string,
  sessions: Array<{
    id: string;
    termId: string;
    classId: string;
    streamId: string | null;
    attendanceDate: Date;
    status: SchoolAttendanceSessionStatus;
    notes: string | null;
    submittedAt: Date | null;
    lockedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUserId: string;
    submittedByUserId: string | null;
    lockedByUserId: string | null;
  }>,
) {
  if (sessions.length === 0) return [];

  const termIds = [...new Set(sessions.map((session) => session.termId))];
  const classIds = [...new Set(sessions.map((session) => session.classId))];
  const streamIds = [
    ...new Set(sessions.map((session) => session.streamId).filter(Boolean) as string[]),
  ];

  const [terms, classes, streams, lineGroups] = await Promise.all([
    prisma.schoolTerm.findMany({
      where: { companyId, id: { in: termIds } },
      select: { id: true, code: true, name: true },
    }),
    prisma.schoolClass.findMany({
      where: { companyId, id: { in: classIds } },
      select: { id: true, code: true, name: true },
    }),
    streamIds.length > 0
      ? prisma.schoolStream.findMany({
          where: { companyId, id: { in: streamIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    prisma.schoolAttendanceSessionLine.groupBy({
      by: ["sessionId", "status"],
      where: {
        companyId,
        sessionId: { in: sessions.map((session) => session.id) },
      },
      _count: { _all: true },
    }),
  ]);

  const termMap = new Map(terms.map((row) => [row.id, row]));
  const classMap = new Map(classes.map((row) => [row.id, row]));
  const streamMap = new Map(streams.map((row) => [row.id, row]));

  const lineStats = new Map<
    string,
    Record<SchoolAttendanceEntryStatus, number>
  >();
  for (const group of lineGroups) {
    const current =
      lineStats.get(group.sessionId) ??
      ({
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        EXCUSED: 0,
      } as Record<SchoolAttendanceEntryStatus, number>);
    current[group.status] = group._count._all;
    lineStats.set(group.sessionId, current);
  }

  return sessions.map((session) => {
    const counts =
      lineStats.get(session.id) ??
      ({
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        EXCUSED: 0,
      } as Record<SchoolAttendanceEntryStatus, number>);
    return {
      ...session,
      term: termMap.get(session.termId) ?? null,
      class: classMap.get(session.classId) ?? null,
      stream: session.streamId ? streamMap.get(session.streamId) ?? null : null,
      lineSummary: {
        present: counts.PRESENT,
        absent: counts.ABSENT,
        late: counts.LATE,
        excused: counts.EXCUSED,
        total: counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED,
      },
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = attendanceSessionsQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where: Prisma.SchoolAttendanceSessionWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.streamId ? { streamId: query.streamId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            attendanceDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { notes: { contains: query.search, mode: "insensitive" } },
              { createdByUserId: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolAttendanceSession.findMany({
        where,
        orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolAttendanceSession.count({ where }),
    ]);

    const presented = await mapSessionPresentation(companyId, records);
    return successResponse(
      paginationResponse(presented, total, page, limit),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/attendance/sessions error:", error);
    return errorResponse("Failed to fetch attendance sessions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createAttendanceSessionSchema.parse(body);

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

    await ensureSessionCreatePermission({
      companyId,
      userId: session.user.id,
      role: session.user.role,
      termId: validated.termId,
      classId: validated.classId,
      streamId: validated.streamId ?? null,
    });

    const attendanceDate = new Date(validated.attendanceDate);
    const existing = await prisma.schoolAttendanceSession.findFirst({
      where: {
        companyId,
        termId: validated.termId,
        classId: validated.classId,
        streamId: validated.streamId ?? null,
        attendanceDate,
      },
      select: { id: true },
    });
    if (existing) {
      return errorResponse("Attendance session already exists for this scope and date", 409);
    }

    const lines = validated.lines ?? [];
    if (lines.length > 0) {
      const studentIds = [...new Set(lines.map((line) => line.studentId))];
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
          "One or more students do not belong to the selected class/stream",
          400,
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const sessionRow = await tx.schoolAttendanceSession.create({
        data: {
          companyId,
          termId: validated.termId,
          classId: validated.classId,
          streamId: validated.streamId ?? null,
          attendanceDate,
          status: "DRAFT",
          notes: validated.notes?.trim() || null,
          createdByUserId: session.user.id,
        },
      });

      if (lines.length > 0) {
        await tx.schoolAttendanceSessionLine.createMany({
          data: lines.map((line) => ({
            companyId,
            sessionId: sessionRow.id,
            studentId: line.studentId,
            status: line.status,
            remarks: line.remarks?.trim() || null,
          })),
        });
      }

      return sessionRow;
    });

    const presented = await mapSessionPresentation(companyId, [created]);
    return successResponse(presented[0], 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Error && error.message === "TEACHER_PROFILE_REQUIRED") {
      return errorResponse("Active teacher profile is required for attendance capture", 403);
    }
    if (error instanceof Error && error.message === "ATTENDANCE_SCOPE_NOT_ASSIGNED") {
      return errorResponse("You are not assigned to this class/stream for attendance capture", 403);
    }
    console.error("[API] POST /api/v2/schools/attendance/sessions error:", error);
    return errorResponse("Failed to create attendance session");
  }
}

