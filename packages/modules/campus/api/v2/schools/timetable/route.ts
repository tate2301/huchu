import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../permissions";
import { getCurrentTerm } from "../../../../calendar";
import { createTimetableSlot, isDayOfWeek } from "../../../../timetable";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  teacherProfileId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
});

const createSchema = z.object({
  classSubjectId: z.string().uuid(),
  periodId: z.string().uuid(),
  dayOfWeek: z.number().int().min(1).max(7),
  roomId: z.string().uuid().nullish(),
  /** Absent means the school's current term. */
  termId: z.string().uuid().optional(),
});

const slotSelect = {
  id: true,
  dayOfWeek: true,
  termId: true,
  periodId: true,
  period: {
    select: {
      id: true,
      code: true,
      name: true,
      startMinute: true,
      endMinute: true,
      sequence: true,
    },
  },
  room: { select: { id: true, code: true, name: true } },
  classSubject: {
    select: {
      id: true,
      subject: { select: { id: true, code: true, name: true } },
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
      teacherProfile: {
        select: {
          id: true,
          employeeCode: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  },
};

/**
 * A whole timetable, not a page of one.
 *
 * Deliberately unpaginated: the caller is drawing a grid of days against
 * periods, and a timetable with half its lessons missing because they fell on
 * page two is worse than no timetable. A term's slots are bounded by
 * days × periods × classes, which is small.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      teacherProfileId: searchParams.get("teacherProfileId") ?? undefined,
      roomId: searchParams.get("roomId") ?? undefined,
    });

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse(
        "This school has no active term. Open an academic year and term under Academics before building a timetable.",
        409,
      );
    }

    const slots = await prisma.schoolTimetableSlot.findMany({
      where: {
        companyId,
        termId,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.streamId ? { streamId: query.streamId } : {}),
        ...(query.teacherProfileId ? { teacherProfileId: query.teacherProfileId } : {}),
        ...(query.roomId ? { roomId: query.roomId } : {}),
      },
      select: slotSelect,
      orderBy: [
        { dayOfWeek: "asc" },
        { period: { sequence: "asc" } },
        { class: { level: "asc" } },
      ],
    });

    // The periods travel with the slots because the grid needs its rows even
    // where nothing is scheduled — an empty Friday afternoon is information.
    const periods = await prisma.schoolPeriod.findMany({
      where: { companyId, OR: [{ termId }, { termId: null }] },
      select: {
        id: true,
        code: true,
        name: true,
        startMinute: true,
        endMinute: true,
        sequence: true,
        isTeaching: true,
      },
      orderBy: [{ sequence: "asc" }, { startMinute: "asc" }],
    });

    return successResponse({ termId, periods, slots });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/timetable error:", error);
    return errorResponse("Failed to fetch timetable");
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
    if (!isDayOfWeek(validated.dayOfWeek)) {
      return errorResponse("Day must be 1 (Monday) to 7 (Sunday)", 400);
    }

    const termId = validated.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse(
        "This school has no active term. Open an academic year and term under Academics first.",
        409,
      );
    }

    const result = await createTimetableSlot({
      companyId,
      termId,
      classSubjectId: validated.classSubjectId,
      periodId: validated.periodId,
      dayOfWeek: validated.dayOfWeek,
      roomId: validated.roomId ?? null,
    });

    if (!result.ok && "notFound" in result) {
      return errorResponse("Class-subject assignment not found", 404);
    }
    if (!result.ok) {
      // 409 with every reason, so the timetabler fixes the placement once
      // rather than discovering the clashes one refused save at a time.
      return errorResponse(
        result.conflicts.map((conflict) => conflict.message).join(" "),
        409,
        result.conflicts,
      );
    }

    const created = await prisma.schoolTimetableSlot.findUnique({
      where: { id: result.slotId },
      select: slotSelect,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/timetable error:", error);
    return errorResponse("Failed to schedule the lesson");
  }
}
