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
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  optionalDateInputSchema,
  schoolEnrollmentStatusSchema,
  toNullableDate,
  toOptionalDate,
} from "../_helpers";

const enrollmentQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  status: schoolEnrollmentStatusSchema.optional(),
});

const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  status: schoolEnrollmentStatusSchema.optional(),
  enrolledAt: optionalDateInputSchema,
  endedAt: nullableDateInputSchema,
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
});

const enrollmentInclude = {
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      status: true,
      currentClassId: true,
      currentStreamId: true,
    },
  },
  term: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, code: true, name: true } },
  stream: { select: { id: true, code: true, name: true } },
} satisfies Prisma.SchoolEnrollmentInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = enrollmentQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where: Prisma.SchoolEnrollmentWhereInput = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.student = {
        OR: [
          { studentNo: { contains: query.search, mode: "insensitive" } },
          { firstName: { contains: query.search, mode: "insensitive" } },
          { lastName: { contains: query.search, mode: "insensitive" } },
        ],
      };
    }
    if (query.studentId) where.studentId = query.studentId;
    if (query.termId) where.termId = query.termId;
    if (query.classId) where.classId = query.classId;
    if (query.streamId) where.streamId = query.streamId;
    if (query.status) where.status = query.status;

    const [records, total] = await Promise.all([
      prisma.schoolEnrollment.findMany({
        where,
        include: enrollmentInclude,
        orderBy: [{ enrolledAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolEnrollment.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/enrollments error:", error);
    return errorResponse("Failed to fetch enrollments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createEnrollmentSchema.parse(body);
    const companyId = session.user.companyId;

    const [student, term, schoolClass, stream] = await Promise.all([
      prisma.schoolStudent.findFirst({
        where: { id: validated.studentId, companyId },
        select: { id: true },
      }),
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

    if (!student) return errorResponse("Invalid student for this company", 400);
    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);
    if (validated.streamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (stream && stream.classId !== validated.classId) {
      return errorResponse("Stream does not belong to the selected class", 400);
    }

    const enrolledAt = toOptionalDate(validated.enrolledAt) ?? new Date();
    const endedAt = toNullableDate(validated.endedAt);
    if (endedAt && endedAt < enrolledAt) {
      return errorResponse("endedAt cannot be before enrolledAt", 400);
    }

    const enrollment = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolEnrollment.create({
        data: {
          companyId,
          studentId: validated.studentId,
          termId: validated.termId,
          classId: validated.classId,
          streamId: validated.streamId ?? null,
          status: validated.status ?? "ACTIVE",
          enrolledAt,
          endedAt,
          notes: normalizeOptionalNullableString(validated.notes) ?? null,
        },
        include: enrollmentInclude,
      });

      if ((validated.status ?? "ACTIVE") === "ACTIVE") {
        await tx.schoolStudent.update({
          where: { id: validated.studentId },
          data: {
            status: "ACTIVE",
            currentClassId: validated.classId,
            currentStreamId: validated.streamId ?? null,
          },
        });
      }

      return created;
    });

    return successResponse(enrollment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse(
        "Enrollment already exists for this student and term",
        409,
      );
    }
    console.error("[API] POST /api/v2/schools/enrollments error:", error);
    return errorResponse("Failed to create enrollment");
  }
}

