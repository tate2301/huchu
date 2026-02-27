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
import { isUniqueConstraintError } from "../_helpers";

const subjectQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createSubjectSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  isCore: z.boolean().optional(),
  passMark: z.number().min(0).max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = subjectQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
    });

    const where: { companyId: string; isActive?: boolean; OR?: object[] } = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.isActive !== undefined) where.isActive = query.isActive;

    const [records, total] = await Promise.all([
      prisma.schoolSubject.findMany({
        where,
        include: {
          _count: {
            select: { classSubjects: true },
          },
        },
        orderBy: [{ name: "asc" }],
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
    console.error("[API] GET /api/v2/schools/subjects error:", error);
    return errorResponse("Failed to fetch subjects");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createSubjectSchema.parse(body);
    const companyId = session.user.companyId;

    const subject = await prisma.schoolSubject.create({
      data: {
        companyId,
        code: validated.code,
        name: validated.name,
        isCore: validated.isCore ?? true,
        passMark: validated.passMark ?? 50,
      },
      include: {
        _count: {
          select: { classSubjects: true },
        },
      },
    });

    return successResponse(subject, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A subject with this code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/subjects error:", error);
    return errorResponse("Failed to create subject");
  }
}
