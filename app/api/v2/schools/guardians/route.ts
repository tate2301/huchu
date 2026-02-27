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
import { isUniqueConstraintError, normalizeOptionalNullableString } from "../_helpers";

const guardianQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
});

const guardianStudentLinkSchema = z.object({
  studentId: z.string().uuid(),
  relationship: z.string().trim().min(1).max(120),
  isPrimary: z.boolean().optional(),
  canReceiveFinancials: z.boolean().optional(),
  canReceiveAcademicResults: z.boolean().optional(),
});

const createGuardianSchema = z.object({
  guardianNo: z.string().trim().min(1).max(40).optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(50),
  email: z.string().trim().email().nullable().optional(),
  address: z.string().trim().min(1).max(500).nullable().optional(),
  nationalId: z.string().trim().min(1).max(80).nullable().optional(),
  studentLinks: z.array(guardianStudentLinkSchema).optional(),
});

const guardianInclude = {
  studentLinks: {
    include: {
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    },
  },
  _count: {
    select: {
      studentLinks: true,
    },
  },
} satisfies Prisma.SchoolGuardianInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = guardianQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
    });

    const where: Prisma.SchoolGuardianWhereInput = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.OR = [
        { guardianNo: { contains: query.search, mode: "insensitive" } },
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { nationalId: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.studentId) {
      where.studentLinks = {
        some: {
          studentId: query.studentId,
        },
      };
    }

    const [records, total] = await Promise.all([
      prisma.schoolGuardian.findMany({
        where,
        include: guardianInclude,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolGuardian.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/guardians error:", error);
    return errorResponse("Failed to fetch guardians");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createGuardianSchema.parse(body);
    const companyId = session.user.companyId;

    let guardianNo: string;
    try {
      guardianNo = validated.guardianNo
        ? normalizeProvidedId(validated.guardianNo, "SCHOOL_GUARDIAN")
        : await reserveIdentifier(prisma, {
            companyId,
            entity: "SCHOOL_GUARDIAN",
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid guardian number format";
      return errorResponse(message, 400);
    }

    const studentLinks = validated.studentLinks ?? [];
    const studentIds = studentLinks.map((link) => link.studentId);
    const uniqueStudentIds = new Set(studentIds);
    if (uniqueStudentIds.size !== studentIds.length) {
      return errorResponse("Duplicate student links are not allowed in one request", 400);
    }

    if (studentIds.length > 0) {
      const students = await prisma.schoolStudent.findMany({
        where: {
          companyId,
          id: { in: studentIds },
        },
        select: { id: true },
      });
      if (students.length !== studentIds.length) {
        return errorResponse("One or more students are invalid for this company", 400);
      }
    }

    const guardian = await prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo,
        firstName: validated.firstName,
        lastName: validated.lastName,
        phone: validated.phone,
        email: normalizeOptionalNullableString(validated.email) ?? null,
        address: normalizeOptionalNullableString(validated.address) ?? null,
        nationalId: normalizeOptionalNullableString(validated.nationalId) ?? null,
        studentLinks:
          studentLinks.length > 0
            ? {
                create: studentLinks.map((link) => ({
                  companyId,
                  studentId: link.studentId,
                  relationship: link.relationship,
                  isPrimary: link.isPrimary ?? false,
                  canReceiveFinancials: link.canReceiveFinancials ?? true,
                  canReceiveAcademicResults: link.canReceiveAcademicResults ?? true,
                })),
              }
            : undefined,
      },
      include: guardianInclude,
    });

    return successResponse(guardian, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Guardian number or student link already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/guardians error:", error);
    return errorResponse("Failed to create guardian");
  }
}

