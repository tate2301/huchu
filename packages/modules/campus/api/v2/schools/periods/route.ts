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
import { findOverlappingPeriod, isValidPeriodRange } from "../../../../timetable";
import { isUniqueConstraintError } from "../_helpers";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  isTeaching: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  /**
   * Minutes from midnight. The client sends the number rather than "07:30" so
   * there is one representation on the wire, in the column and in the
   * comparison — see the note on `SchoolPeriod` in the schema.
   */
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  sequence: z.number().int().min(0).max(100),
  isTeaching: z.boolean().optional(),
  /** Null, or absent, means the period applies to every term. */
  termId: z.string().uuid().nullish(),
});

const periodSelect = {
  id: true,
  code: true,
  name: true,
  startMinute: true,
  endMinute: true,
  sequence: true,
  isTeaching: true,
  termId: true,
  term: { select: { id: true, code: true, name: true } },
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
      termId: searchParams.get("termId") ?? undefined,
      isTeaching: searchParams.get("isTeaching") ?? undefined,
    });

    const where = {
      companyId: session.user.companyId,
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.isTeaching === undefined ? {} : { isTeaching: query.isTeaching }),
    };

    const [records, total] = await Promise.all([
      prisma.schoolPeriod.findMany({
        where,
        select: periodSelect,
        // The order the day runs in, which is what a timetable is read down.
        orderBy: [{ sequence: "asc" }, { startMinute: "asc" }],
        skip,
        take: limit,
      }),
      prisma.schoolPeriod.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/periods error:", error);
    return errorResponse("Failed to fetch periods");
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

    const validated = createSchema.parse(await request.json());

    if (!isValidPeriodRange(validated.startMinute, validated.endMinute)) {
      return errorResponse("A period must end after it starts", 400);
    }

    const termId = validated.termId ?? null;
    if (termId) {
      const term = await prisma.schoolTerm.findFirst({
        where: { id: termId, companyId },
        select: { id: true },
      });
      if (!term) return errorResponse("Term not found", 404);
    }

    const overlapping = await findOverlappingPeriod({
      companyId,
      termId,
      startMinute: validated.startMinute,
      endMinute: validated.endMinute,
    });
    if (overlapping) {
      return errorResponse(
        `These times overlap ${overlapping.name}. Two periods covering the same minute make "what is happening now" ambiguous.`,
        409,
      );
    }

    const created = await prisma.schoolPeriod.create({
      data: {
        companyId,
        termId,
        code: validated.code,
        name: validated.name,
        startMinute: validated.startMinute,
        endMinute: validated.endMinute,
        sequence: validated.sequence,
        isTeaching: validated.isTeaching ?? true,
      },
      select: periodSelect,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A period with this code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/periods error:", error);
    return errorResponse("Failed to create period");
  }
}
