import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { daysAway, ExamError, listSeries } from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Exam series.
 *
 * `schools.exams` is a paid add-on with its own feature key, so this route is
 * gated twice over: the route registry answers "is the add-on switched on for
 * this tenant" before the handler runs, and `schoolPermissionDenial` answers
 * "may this member of staff read the exam roll". Without the registry row the
 * prefix would fall through to `schools.core` and the add-on would be free.
 *
 * The band's first chip is the days to the nearest deadline, and it is computed
 * here rather than in the browser: a clock read in the browser is a different
 * clock from the one the deadline was set against, and "7 days" showing as "8"
 * on a machine an hour ahead is the one error this page cannot afford.
 */

const listQuery = z.object({
  boardId: z.string().uuid().optional(),
  level: z.enum(["O_LEVEL", "A_LEVEL", "IGCSE"]).optional(),
  status: z.enum(["open", "results", "all"]).optional(),
  search: z.string().trim().max(120).optional(),
});

const createSchema = z.object({
  boardId: z.string().uuid(),
  centreId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(80),
  year: z.coerce.number().int().min(2000).max(2100),
  level: z.enum(["O_LEVEL", "A_LEVEL", "IGCSE"]),
  cohortLevel: z.coerce.number().int().min(1).max(13).nullish(),
  entriesOpenAt: z.string().datetime().nullish(),
  entriesCloseAt: z.string().datetime().nullish(),
  lateEntriesCloseAt: z.string().datetime().nullish(),
  startsOn: z.string().datetime().nullish(),
  endsOn: z.string().datetime().nullish(),
  resultsDueOn: z.string().datetime().nullish(),
  feePerSubject: z.coerce.number().min(0).max(100000).nullish(),
  lateFeePerSubject: z.coerce.number().min(0).max(100000).nullish(),
  currency: z.string().trim().length(3).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = listQuery.parse(Object.fromEntries(searchParams.entries()));
    const companyId = session.user.companyId;
    const now = Date.now();

    const rows = await listSeries({ companyId, ...query });
    const open = rows.filter((row) => row.status === "ENTRIES_OPEN" || row.status === "PLANNED");

    // The nearest deadline across the open series, which is the only one that
    // can cost a child a year. Whichever board it belongs to.
    const nearest = open
      .map((row) => ({ row, days: daysAway(row.entriesCloseAt, now) }))
      .filter((entry): entry is { row: typeof open[number]; days: number } => entry.days != null)
      .sort((a, b) => a.days - b.days)[0];

    const unpaid = open.reduce(
      (total, row) => total + (Number(row.invoiced) - Number(row.collected)),
      0,
    );

    return successResponse({
      rows,
      chips: {
        nearestDeadline: nearest
          ? { seriesId: nearest.row.id, boardName: nearest.row.board.name, days: nearest.days }
          : null,
        candidates: open.reduce((total, row) => total + row.candidates, 0),
        entryFeesUnpaid: unpaid.toFixed(2),
      },
      counts: {
        all: rows.length,
        open: open.length,
        resultsIn: rows.filter((row) => row.status === "RESULTS_IN").length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/exams/series error:", error);
    return errorResponse("Failed to read the exam series");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "create");
    if (denied) return errorResponse(denied, 403);

    const body = createSchema.parse(await request.json());
    const created = await prisma.schoolExamSeries.create({
      data: {
        companyId: session.user.companyId,
        boardId: body.boardId,
        centreId: body.centreId ?? null,
        name: body.name,
        year: body.year,
        level: body.level,
        cohortLevel: body.cohortLevel ?? null,
        entriesOpenAt: body.entriesOpenAt ? new Date(body.entriesOpenAt) : null,
        entriesCloseAt: body.entriesCloseAt ? new Date(body.entriesCloseAt) : null,
        lateEntriesCloseAt: body.lateEntriesCloseAt ? new Date(body.lateEntriesCloseAt) : null,
        startsOn: body.startsOn ? new Date(body.startsOn) : null,
        endsOn: body.endsOn ? new Date(body.endsOn) : null,
        resultsDueOn: body.resultsDueOn ? new Date(body.resultsDueOn) : null,
        feePerSubject: body.feePerSubject ?? null,
        lateFeePerSubject: body.lateFeePerSubject ?? null,
        currency: body.currency ?? "USD",
        status: body.entriesOpenAt ? "ENTRIES_OPEN" : "PLANNED",
      },
      select: { id: true, name: true },
    });
    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/exams/series error:", error);
    return errorResponse("Failed to create the series");
  }
}
