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

const classQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
});

const createClassSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  level: z.number().int().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  termId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = classQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
    });

    const where: { companyId: string; OR?: object[] } = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.schoolClass.findMany({
        where,
        include: {
          streams: {
            select: { id: true, code: true, name: true, capacity: true },
            orderBy: { name: "asc" },
          },
          _count: {
            select: {
              streams: true,
              students: true,
            },
          },
        },
        orderBy: [{ level: "asc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.schoolClass.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/classes error:", error);
    return errorResponse("Failed to fetch classes");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createClassSchema.parse(body);
    const companyId = session.user.companyId;

    let termId = validated.termId ?? null;
    if (!termId) {
      const activeTerm = await prisma.schoolTerm.findFirst({
        where: { companyId, isActive: true },
        select: { id: true },
      });
      termId = activeTerm?.id ?? null;
    }

    const schoolClass = await prisma.schoolClass.create({
      data: {
        companyId,
        code: validated.code,
        name: validated.name,
        level: validated.level ?? null,
        capacity: validated.capacity ?? null,
        termId,
      },
      include: {
        _count: {
          select: {
            streams: true,
            students: true,
          },
        },
      },
    });

    return successResponse(schoolClass, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A class with this code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/classes error:", error);
    return errorResponse("Failed to create class");
  }
}
