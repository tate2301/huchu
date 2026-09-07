import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../permissions";
import { isUniqueConstraintError } from "../_helpers";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  capacity: z.number().int().min(0).max(10_000).nullish(),
  kind: z.string().trim().min(1).max(60).nullish(),
});

const roomSelect = {
  id: true,
  code: true,
  name: true,
  capacity: true,
  kind: true,
  isActive: true,
  _count: { select: { slots: true } },
};

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = querySchema.parse({
      search: searchParams.get("search") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
    });

    const where = {
      companyId: session.user.companyId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" as const } },
              { name: { contains: query.search, mode: "insensitive" as const } },
              { kind: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolRoom.findMany({
        where,
        select: roomSelect,
        orderBy: [{ name: "asc" }, { code: "asc" }],
        skip,
        take: limit,
      }),
      prisma.schoolRoom.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/rooms error:", error);
    return errorResponse("Failed to fetch rooms");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);

    const validated = createSchema.parse(await request.json());

    const created = await prisma.schoolRoom.create({
      data: {
        companyId: session.user.companyId,
        code: validated.code,
        name: validated.name,
        capacity: validated.capacity ?? null,
        kind: validated.kind ?? null,
      },
      select: roomSelect,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A room with this code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/rooms error:", error);
    return errorResponse("Failed to create room");
  }
}
