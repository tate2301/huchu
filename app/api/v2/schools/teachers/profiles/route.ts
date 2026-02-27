import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "../../_helpers";

const profilesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createProfileSchema = z.object({
  userId: z.string().uuid(),
  employeeCode: z.string().trim().min(1).max(40),
  department: z.string().trim().min(1).max(120).nullable().optional(),
  isClassTeacher: z.boolean().optional(),
  isHod: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = profilesQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
    });

    const where = {
      companyId: session.user.companyId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { employeeCode: { contains: query.search, mode: "insensitive" as const } },
              { department: { contains: query.search, mode: "insensitive" as const } },
              { user: { name: { contains: query.search, mode: "insensitive" as const } } },
              { user: { email: { contains: query.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolTeacherProfile.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, isActive: true } },
          _count: { select: { assignments: true } },
        },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolTeacherProfile.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/teachers/profiles error:", error);
    return errorResponse("Failed to fetch teacher profiles");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createProfileSchema.parse(body);

    const user = await prisma.user.findFirst({
      where: { id: validated.userId, companyId },
      select: { id: true },
    });
    if (!user) {
      return errorResponse("Selected user does not belong to this company", 400);
    }

    const created = await prisma.schoolTeacherProfile.create({
      data: {
        companyId,
        userId: validated.userId,
        employeeCode: validated.employeeCode.trim().toUpperCase(),
        department: validated.department?.trim() || null,
        isClassTeacher: validated.isClassTeacher ?? false,
        isHod: validated.isHod ?? false,
        isActive: validated.isActive ?? true,
      },
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        _count: { select: { assignments: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Teacher profile already exists for this user or employee code", 409);
    }
    console.error("[API] POST /api/v2/schools/teachers/profiles error:", error);
    return errorResponse("Failed to create teacher profile");
  }
}
