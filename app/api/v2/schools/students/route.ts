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
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  schoolStudentStatusSchema,
  toNullableDate,
} from "../_helpers";

const studentQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: schoolStudentStatusSchema.optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  isBoarding: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const studentGuardianLinkSchema = z.object({
  guardianId: z.string().uuid(),
  relationship: z.string().trim().min(1).max(120),
  isPrimary: z.boolean().optional(),
  canReceiveFinancials: z.boolean().optional(),
  canReceiveAcademicResults: z.boolean().optional(),
});

const createStudentSchema = z.object({
  studentNo: z.string().trim().min(1).max(40).optional(),
  admissionNo: z.string().trim().min(1).max(80).nullable().optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  dateOfBirth: nullableDateInputSchema,
  gender: z.string().trim().min(1).max(30).nullable().optional(),
  status: schoolStudentStatusSchema.optional(),
  currentClassId: z.string().uuid().nullable().optional(),
  currentStreamId: z.string().uuid().nullable().optional(),
  isBoarding: z.boolean().optional(),
  admissionDate: nullableDateInputSchema,
  guardianLinks: z.array(studentGuardianLinkSchema).optional(),
});

const studentInclude = {
  currentClass: { select: { id: true, code: true, name: true } },
  currentStream: { select: { id: true, code: true, name: true, classId: true } },
  guardianLinks: {
    include: {
      guardian: {
        select: {
          id: true,
          guardianNo: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
  },
  _count: {
    select: {
      guardianLinks: true,
      enrollments: true,
      boardingAllocations: true,
      resultLines: true,
    },
  },
} satisfies Prisma.SchoolStudentInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = studentQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      isBoarding: searchParams.get("isBoarding") ?? undefined,
    });

    const where: Prisma.SchoolStudentWhereInput = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.OR = [
        { studentNo: { contains: query.search, mode: "insensitive" } },
        { admissionNo: { contains: query.search, mode: "insensitive" } },
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.classId) where.currentClassId = query.classId;
    if (query.streamId) where.currentStreamId = query.streamId;
    if (query.isBoarding !== undefined) where.isBoarding = query.isBoarding;

    const [records, total] = await Promise.all([
      prisma.schoolStudent.findMany({
        where,
        include: studentInclude,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolStudent.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/students error:", error);
    return errorResponse("Failed to fetch students");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createStudentSchema.parse(body);
    const companyId = session.user.companyId;

    let studentNo: string;
    try {
      studentNo = validated.studentNo
        ? normalizeProvidedId(validated.studentNo, "SCHOOL_STUDENT")
        : await reserveIdentifier(prisma, {
            companyId,
            entity: "SCHOOL_STUDENT",
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid student number format";
      return errorResponse(message, 400);
    }

    let classId = validated.currentClassId ?? null;
    const streamId = validated.currentStreamId ?? null;
    if (classId) {
      const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: classId, companyId },
        select: { id: true },
      });
      if (!schoolClass) {
        return errorResponse("Invalid class for this company", 400);
      }
    }

    if (streamId) {
      const stream = await prisma.schoolStream.findFirst({
        where: { id: streamId, companyId },
        select: { id: true, classId: true },
      });
      if (!stream) {
        return errorResponse("Invalid stream for this company", 400);
      }
      if (classId && stream.classId !== classId) {
        return errorResponse("Stream does not belong to the selected class", 400);
      }
      if (!classId) classId = stream.classId;
    }

    const guardianLinks = validated.guardianLinks ?? [];
    const guardianIds = guardianLinks.map((link) => link.guardianId);
    const uniqueGuardianIds = new Set(guardianIds);
    if (uniqueGuardianIds.size !== guardianIds.length) {
      return errorResponse("Duplicate guardians are not allowed in one request", 400);
    }

    const primaryCount = guardianLinks.filter((link) => link.isPrimary).length;
    if (primaryCount > 1) {
      return errorResponse("Only one primary guardian can be assigned per student", 400);
    }

    if (guardianIds.length > 0) {
      const guardians = await prisma.schoolGuardian.findMany({
        where: { companyId, id: { in: guardianIds } },
        select: { id: true },
      });
      if (guardians.length !== guardianIds.length) {
        return errorResponse("One or more guardians are invalid for this company", 400);
      }
    }

    const student = await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo,
        admissionNo: normalizeOptionalNullableString(validated.admissionNo) ?? null,
        firstName: validated.firstName,
        lastName: validated.lastName,
        dateOfBirth: toNullableDate(validated.dateOfBirth),
        gender: normalizeOptionalNullableString(validated.gender) ?? null,
        status: validated.status ?? "APPLICANT",
        currentClassId: classId,
        currentStreamId: streamId,
        isBoarding: validated.isBoarding ?? false,
        admissionDate: toNullableDate(validated.admissionDate),
        guardianLinks:
          guardianLinks.length > 0
            ? {
                create: guardianLinks.map((link) => ({
                  companyId,
                  guardianId: link.guardianId,
                  relationship: link.relationship,
                  isPrimary: link.isPrimary ?? false,
                  canReceiveFinancials: link.canReceiveFinancials ?? true,
                  canReceiveAcademicResults: link.canReceiveAcademicResults ?? true,
                })),
              }
            : undefined,
      },
      include: studentInclude,
    });

    return successResponse(student, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Student number or admission number already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/students error:", error);
    return errorResponse("Failed to create student");
  }
}
