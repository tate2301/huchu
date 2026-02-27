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

const windowsQuerySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  status: z.enum(["SCHEDULED", "OPEN", "CLOSED"]).optional(),
});

const createWindowSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
  streamId: z.string().uuid().nullable().optional(),
  openAt: z.string().datetime(),
  closeAt: z.string().datetime(),
  status: z.enum(["SCHEDULED", "OPEN", "CLOSED"]).optional(),
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = windowsQuerySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where = {
      companyId,
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.streamId ? { streamId: query.streamId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolPublishWindow.findMany({
        where,
        include: {
          term: { select: { id: true, code: true, name: true } },
          class: { select: { id: true, code: true, name: true } },
          stream: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ openAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolPublishWindow.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/results/publish/windows error:", error);
    return errorResponse("Failed to fetch publish windows");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createWindowSchema.parse(body);

    const openAt = new Date(validated.openAt);
    const closeAt = new Date(validated.closeAt);
    if (closeAt <= openAt) {
      return errorResponse("closeAt must be after openAt", 400);
    }

    const [term, schoolClass, stream] = await Promise.all([
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
      validated.classId
        ? prisma.schoolClass.findFirst({
            where: { id: validated.classId, companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
      validated.streamId
        ? prisma.schoolStream.findFirst({
            where: { id: validated.streamId, companyId },
            select: { id: true, classId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!term) return errorResponse("Invalid term for this company", 400);
    if (validated.classId && !schoolClass) {
      return errorResponse("Invalid class for this company", 400);
    }
    if (validated.streamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (validated.streamId && !validated.classId) {
      return errorResponse("classId is required when streamId is provided", 400);
    }
    if (stream && validated.classId && stream.classId !== validated.classId) {
      return errorResponse("Selected stream does not belong to class", 400);
    }

    const created = await prisma.schoolPublishWindow.create({
      data: {
        companyId,
        termId: validated.termId,
        classId: validated.classId ?? null,
        streamId: validated.streamId ?? null,
        openAt,
        closeAt,
        status: validated.status ?? "SCHEDULED",
        notes: validated.notes?.trim() || null,
        createdById: session.user.id,
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/results/publish/windows error:", error);
    return errorResponse("Failed to create publish window");
  }
}
