import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  CALENDAR_EVENT_SELECT,
  calendarEventCreateSchema,
  checkCalendarEventWindow,
  defaultIsTeachingDay,
  getSchoolDay,
} from "@/lib/schools/calendar";

const querySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  /** Ask whether one particular day is a school day, and why not. */
  on: z.string().date().optional(),
});

/**
 * The calendar, and the school-day verdict derived from it.
 *
 * Unpaginated: a year of events is a small list a caller draws as a calendar,
 * and a page of it would be a calendar with holes in.
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
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      on: searchParams.get("on") ?? undefined,
    });

    const schoolDay = query.on
      ? await getSchoolDay(companyId, new Date(query.on))
      : null;

    const events = await prisma.schoolCalendarEvent.findMany({
      where: {
        companyId,
        ...(query.from ? { endDate: { gte: new Date(query.from) } } : {}),
        ...(query.to ? { startDate: { lte: new Date(query.to) } } : {}),
      },
      select: CALENDAR_EVENT_SELECT,
      orderBy: [{ startDate: "asc" }],
    });

    return successResponse({ events, schoolDay });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/calendar error:", error);
    return errorResponse("Failed to fetch the calendar");
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

    const validated = calendarEventCreateSchema.parse(await request.json());
    const startDate = new Date(validated.startDate);
    const endDate = new Date(validated.endDate);

    const problem = await checkCalendarEventWindow({
      companyId,
      termId: validated.termId ?? null,
      startDate,
      endDate,
    });
    if (problem) return errorResponse(problem.message, problem.status);

    const kind = validated.kind ?? "EVENT";

    const created = await prisma.schoolCalendarEvent.create({
      data: {
        companyId,
        termId: validated.termId ?? null,
        title: validated.title,
        kind,
        startDate,
        endDate,
        isTeachingDay: validated.isTeachingDay ?? defaultIsTeachingDay(kind),
        notes: validated.notes ?? null,
      },
      select: CALENDAR_EVENT_SELECT,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/calendar error:", error);
    return errorResponse("Failed to create the calendar event");
  }
}
