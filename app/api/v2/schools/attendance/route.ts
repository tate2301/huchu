import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolStudentStatusSchema } from "../_helpers";

const attendanceQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  status: schoolStudentStatusSchema.optional(),
  isBoarding: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = attendanceQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      isBoarding: searchParams.get("isBoarding") ?? undefined,
    });

    const where: Prisma.SchoolStudentWhereInput = {
      companyId,
      ...(query.classId ? { currentClassId: query.classId } : {}),
      ...(query.streamId ? { currentStreamId: query.streamId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isBoarding !== undefined ? { isBoarding: query.isBoarding } : {}),
      ...(query.search
        ? {
            OR: [
              { studentNo: { contains: query.search, mode: "insensitive" } },
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [records, total, counts] = await Promise.all([
      prisma.schoolStudent.findMany({
        where,
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          status: true,
          isBoarding: true,
          currentClass: { select: { id: true, code: true, name: true } },
          currentStream: { select: { id: true, code: true, name: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip,
        take: limit,
      }),
      prisma.schoolStudent.count({ where }),
      prisma.schoolStudent.groupBy({
        by: ["status"],
        where: { companyId },
        _count: { _all: true },
      }),
    ]);

    const paged = paginationResponse(records, total, page, limit);
    return successResponse({
      success: true,
      data: {
        resource: "schools-attendance",
        companyId,
        ...paged,
        summary: {
          totalStudents: counts.reduce((sum, row) => sum + row._count._all, 0),
          activeStudents:
            counts.find((row) => row.status === "ACTIVE")?._count._all ?? 0,
          applicantStudents:
            counts.find((row) => row.status === "APPLICANT")?._count._all ?? 0,
          suspendedStudents:
            counts.find((row) => row.status === "SUSPENDED")?._count._all ?? 0,
          listedBoarders: records.filter((student) => student.isBoarding).length,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/attendance error:", error);
    return errorResponse("Failed to fetch attendance roster");
  }
}
