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
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { isUniqueConstraintError } from "../_helpers";

/**
 * Streams — the sets a class is split into.
 *
 * They existed in the schema and were readable through the class detail route,
 * and there was no way to make one. Every roll, mark sheet and publish window
 * filters by a stream, so a school that arrived without them could not narrow
 * anything and had no screen that would let it fix that. This is the missing
 * write side, gated exactly as classes are — a stream is part of the academic
 * ladder, so `schools.academics` answers for it.
 */

const querySchema = z.object({
  classId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

const createStreamSchema = z.object({
  classId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  capacity: z.number().int().positive().nullable().optional(),
  /** Absent means "inherit the class's term", which is what a stream normally wants. */
  termId: z.string().uuid().nullable().optional(),
});

const streamSelect = {
  id: true,
  code: true,
  name: true,
  capacity: true,
  classId: true,
  termId: true,
  class: { select: { id: true, code: true, name: true, level: true } },
  _count: { select: { students: true, enrollments: true } },
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
      classId: searchParams.get("classId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where = {
      companyId: session.user.companyId,
      ...(query.classId ? { classId: query.classId } : {}),
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
      prisma.schoolStream.findMany({
        where,
        select: streamSelect,
        // Down the ladder, then by name: the order a school reads its own
        // register list in.
        orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.schoolStream.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/streams error:", error);
    return errorResponse("Failed to fetch streams");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = createStreamSchema.parse(await request.json());

    const parent = await prisma.schoolClass.findFirst({
      where: { id: validated.classId, companyId },
      select: { id: true, termId: true },
    });
    if (!parent) return errorResponse("Class not found", 404);

    // A stream sits in the same term as the class it belongs to unless the
    // caller says otherwise; asking the office to restate the term for every
    // stream is a question with one right answer.
    const termId =
      validated.termId === undefined ? parent.termId : validated.termId;
    if (termId) {
      const term = await prisma.schoolTerm.findFirst({
        where: { id: termId, companyId },
        select: { id: true },
      });
      if (!term) return errorResponse("Invalid term for this company", 400);
    }

    const created = await prisma.schoolStream.create({
      data: {
        companyId,
        classId: parent.id,
        termId,
        code: validated.code,
        name: validated.name,
        capacity: validated.capacity ?? null,
      },
      select: streamSelect,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("This class already has a stream with that code", 409);
    }
    console.error("[API] POST /api/v2/schools/streams error:", error);
    return errorResponse("Failed to create stream");
  }
}
