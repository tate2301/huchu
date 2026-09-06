import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { defaultIsTeachingDay, getSchoolDay } from "@/lib/schools/calendar";
import { dateInputSchema } from "../_helpers";

const querySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  /** Ask whether one particular day is a school day, and why not. */
  on: z.string().date().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z
    .enum(["HOLIDAY", "PUBLIC_HOLIDAY", "HALF_TERM", "EXAM", "EVENT", "STAFF_ONLY"])
    .optional(),
  startDate: dateInputSchema,
  endDate: dateInputSchema,
  isTeachingDay: z.boolean().optional(),
  termId: z.string().uuid().nullish(),
  notes: z.string().trim().max(500).nullish(),
});

const eventSelect = {
  id: true,
  title: true,
  kind: true,
  startDate: true,
  endDate: true,
  isTeachingDay: true,
  notes: true,
  termId: true,
  term: { select: { id: true, code: true, name: true } },
};

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
      select: eventSelect,
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

    const validated = createSchema.parse(await request.json());
    const startDate = new Date(validated.startDate);
    const endDate = new Date(validated.endDate);

    if (startDate > endDate) {
      return errorResponse("The event must end on or after it starts", 400);
    }

    if (validated.termId) {
      const term = await prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true, name: true, startDate: true, endDate: true },
      });
      if (!term) return errorResponse("Term not found", 404);

      // A half-term break that falls outside its term is a data entry slip
      // that reads as a fact — the calendar screen prints the term name beside
      // the dates, so the row would say "Term 2" next to a date after Term 2
      // ended and nobody would question it.
      if (startDate < term.startDate || endDate > term.endDate) {
        return errorResponse(
          `${term.name} runs ${term.startDate.toISOString().slice(0, 10)} to ${term.endDate
            .toISOString()
            .slice(0, 10)} — leave the term blank for a date outside it`,
          400,
        );
      }
    }

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
      select: eventSelect,
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
