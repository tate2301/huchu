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

const subjectsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createSubjectSchema = z.object({
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(1).max(120),
  passMark: z.number().finite().min(0).max(100).optional(),
  isCore: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = subjectsQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
    });

    const where = {
      companyId: session.user.companyId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" as const } },
              { name: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolSubject.findMany({
        where,
        include: {
          _count: { select: { classSubjects: true } },
        },
        orderBy: [{ isActive: "desc" }, { code: "asc" }],
        skip,
        take: limit,
      }),
      prisma.schoolSubject.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/teachers/subjects error:", error);
    return errorResponse("Failed to fetch school subjects");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createSubjectSchema.parse(body);

    const created = await prisma.schoolSubject.create({
      data: {
        companyId,
        code: validated.code.trim().toUpperCase(),
        name: validated.name.trim(),
        passMark: validated.passMark ?? 50,
        isCore: validated.isCore ?? true,
        isActive: validated.isActive ?? true,
      },
      include: {
        _count: { select: { classSubjects: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A subject with this code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/teachers/subjects error:", error);
    return errorResponse("Failed to create school subject");
  }
}
