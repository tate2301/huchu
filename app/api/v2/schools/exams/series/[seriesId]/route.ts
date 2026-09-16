import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { deadlineRows, ExamError, seriesTallies } from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One series: its dates, and the five numbers every screen under it draws.
 *
 * The deadline table is computed server-side against one clock, for the reason
 * the index gives: a date that says "7 days" on one machine and "8" on another
 * is the one error this page cannot afford.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "view");
    if (denied) return errorResponse(denied, 403);

    const { seriesId } = await context.params;
    const companyId = session.user.companyId;

    const series = await prisma.schoolExamSeries.findFirst({
      where: { id: seriesId, companyId },
      select: {
        id: true,
        name: true,
        year: true,
        level: true,
        status: true,
        cohortLevel: true,
        entriesOpenAt: true,
        entriesCloseAt: true,
        lateEntriesCloseAt: true,
        startsOn: true,
        endsOn: true,
        resultsDueOn: true,
        feePerSubject: true,
        lateFeePerSubject: true,
        currency: true,
        board: { select: { id: true, code: true, name: true } },
        centre: { select: { id: true, number: true } },
        entryFileRuns: {
          select: { id: true, builtAt: true, entryCount: true, candidateCount: true },
          orderBy: { builtAt: "desc" },
          take: 1,
        },
      },
    });
    if (!series) return errorResponse("That series is not this school's.", 404);

    const now = Date.now();
    const tallies = await seriesTallies({ companyId, seriesId, now });

    return successResponse({
      series: {
        ...series,
        feePerSubject: series.feePerSubject?.toFixed(2) ?? null,
        lateFeePerSubject: series.lateFeePerSubject?.toFixed(2) ?? null,
      },
      deadlines: deadlineRows(series, now),
      tallies,
      // What `Build the entry file` last produced. Not a submission receipt —
      // S-13.3 is deferred and a human uploads the file.
      lastEntryFile: series.entryFileRuns[0] ?? null,
    });
  } catch (error) {
    if (error instanceof ExamError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/exams/series/[id] error:", error);
    return errorResponse("Failed to read the series");
  }
}

/**
 * Correct a series — above all, the date entries close.
 *
 * Everything a series is made of was permanent from its first save: the dates,
 * the fees, the centre number, the name that goes on the entry file. A board
 * that moved its deadline, a fee announced in July and revised in August, a
 * name typed `Novmber` — none of them could be put right. The deadline is the
 * one that costs something. This file's own header says a missed ZIMSEC
 * deadline costs a pupil a year, and a school that typed 3 September where it
 * meant 3 August was being counted down to the wrong morning with no way to
 * say so.
 *
 * The dates and the fees are `nullish` rather than optional, because clearing
 * one is a real act. A board that drops its late window leaves a school holding
 * a late deadline that is no longer true, so "not mentioned" and "rub it out"
 * have to stay two different requests.
 *
 * The board and the level are the two things that stop being correctable. An
 * entry is written against its board's syllabus codes and the level decides the
 * grade set, so moving either underneath a registered candidate leaves every
 * entry pointing at a subject that is not offered. Both are refused with the
 * candidate count, which is the fact the exams officer needs: the way out is a
 * second series, not a rewrite of this one.
 *
 * `status` finally advances. Nothing in the product ever moved it, so every
 * series sat at `PLANNED` from the day it was made and the index tabs and the
 * row badges said `Planned` about a sitting that was long over. Forwards is
 * free; the guards are on the way back, where the word would contradict work
 * the school has already recorded.
 */

const SERIES_STATUSES = [
  "PLANNED",
  "ENTRIES_OPEN",
  "ENTRIES_CLOSED",
  "SAT",
  "RESULTS_IN",
  "ARCHIVED",
] as const;

type SeriesStatus = (typeof SERIES_STATUSES)[number];

/** How far through the sitting each word claims the school has got. */
const STAGE: Record<SeriesStatus, number> = {
  PLANNED: 0,
  ENTRIES_OPEN: 1,
  ENTRIES_CLOSED: 2,
  SAT: 3,
  RESULTS_IN: 4,
  ARCHIVED: 5,
};

const STATUS_WORDS: Record<SeriesStatus, string> = {
  PLANNED: "Planned",
  ENTRIES_OPEN: "Open for entries",
  ENTRIES_CLOSED: "Entries closed",
  SAT: "Sat",
  RESULTS_IN: "Results in",
  ARCHIVED: "Archived",
};

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  boardId: z.string().uuid().optional(),
  level: z.enum(["O_LEVEL", "A_LEVEL", "IGCSE"]).optional(),
  centreId: z.string().uuid().nullish(),
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
  status: z.enum(SERIES_STATUSES).optional(),
});

/**
 * An ISO string becomes a date, an explicit null stays null, and absent stays
 * absent — which is the whole difference between moving a deadline, dropping it
 * and not mentioning it.
 */
function asDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // The authority that makes a series. Correcting a deadline somebody typed
    // wrong is not a lesser act than setting it in the first place.
    const denied = schoolPermissionDenial(session, "schools.exams", "create");
    if (denied) return errorResponse(denied, 403);

    const { seriesId } = await context.params;
    const companyId = session.user.companyId;
    const body = patchSchema.parse(await request.json());

    // The id in the URL is a claim until it is resolved against the caller's
    // company. `update({ where: { id } })` cannot be company-scoped, so this
    // read is the tenant boundary rather than a convenience.
    const existing = await prisma.schoolExamSeries.findFirst({
      where: { id: seriesId, companyId },
      select: { id: true, boardId: true, level: true, status: true },
    });
    if (!existing) return errorResponse("That series is not this school's.", 404);

    const movingBoard = body.boardId !== undefined && body.boardId !== existing.boardId;
    const movingLevel = body.level !== undefined && body.level !== existing.level;
    if (movingBoard || movingLevel) {
      const candidates = await prisma.schoolCandidate.count({
        where: { seriesId: existing.id },
      });
      if (candidates > 0) {
        const what =
          movingBoard && movingLevel ? "board and level are" : movingBoard ? "board is" : "level is";
        return errorResponse(
          `${candidates} candidate${candidates === 1 ? " is" : "s are"} already on this series, so its ${what} fixed. Their entries are written against this board's syllabus codes at this level, and moving the series would leave every one of them pointing at a subject that is not offered. Set up a second series instead.`,
          409,
        );
      }
    }

    // A board or centre id in the body is a claim of the same kind as the one
    // in the URL, and an unchecked one hangs this school's series off another
    // school's board.
    if (body.boardId !== undefined) {
      const board = await prisma.schoolExamBoard.findFirst({
        where: { id: body.boardId, companyId },
        select: { id: true },
      });
      if (!board) return errorResponse("That exam board is not this school's.", 404);
    }
    if (body.centreId) {
      const centre = await prisma.schoolExamCentre.findFirst({
        where: { id: body.centreId, companyId },
        select: { id: true, boardId: true },
      });
      if (!centre) return errorResponse("That centre number is not this school's.", 404);
      // A centre number belongs to one board: `025419` is the school to ZIMSEC
      // and means nothing to Cambridge, which knows it by another number.
      if (centre.boardId !== (body.boardId ?? existing.boardId)) {
        return errorResponse("That centre number belongs to another board.", 422);
      }
    }

    if (body.status !== undefined && body.status !== existing.status) {
      // Forwards is free. Going back past something the school has already
      // recorded would make the badge disown work that exists.
      if (STAGE[body.status] < STAGE.RESULTS_IN) {
        const results = await prisma.schoolExamResult.count({
          where: { seriesId: existing.id },
        });
        if (results > 0) {
          return errorResponse(
            `${results} result${results === 1 ? " is" : "s are"} already captured against this series, so it cannot go back to "${STATUS_WORDS[body.status]}". A grade that changes on appeal is captured as a remark rather than by reopening the series.`,
            409,
          );
        }
      }
      if (body.status === "PLANNED") {
        const candidates = await prisma.schoolCandidate.count({
          where: { seriesId: existing.id },
        });
        if (candidates > 0) {
          return errorResponse(
            `"Planned" means nothing has been entered, and ${candidates} candidate${candidates === 1 ? " is" : "s are"} already registered on this series.`,
            409,
          );
        }
      }
    }

    const updated = await prisma.schoolExamSeries.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.year !== undefined ? { year: body.year } : {}),
        ...(body.boardId !== undefined ? { boardId: body.boardId } : {}),
        ...(body.level !== undefined ? { level: body.level } : {}),
        ...(body.centreId !== undefined ? { centreId: body.centreId } : {}),
        ...(body.cohortLevel !== undefined ? { cohortLevel: body.cohortLevel } : {}),
        ...(body.entriesOpenAt !== undefined
          ? { entriesOpenAt: asDate(body.entriesOpenAt) }
          : {}),
        ...(body.entriesCloseAt !== undefined
          ? { entriesCloseAt: asDate(body.entriesCloseAt) }
          : {}),
        ...(body.lateEntriesCloseAt !== undefined
          ? { lateEntriesCloseAt: asDate(body.lateEntriesCloseAt) }
          : {}),
        ...(body.startsOn !== undefined ? { startsOn: asDate(body.startsOn) } : {}),
        ...(body.endsOn !== undefined ? { endsOn: asDate(body.endsOn) } : {}),
        ...(body.resultsDueOn !== undefined ? { resultsDueOn: asDate(body.resultsDueOn) } : {}),
        ...(body.feePerSubject !== undefined ? { feePerSubject: body.feePerSubject } : {}),
        ...(body.lateFeePerSubject !== undefined
          ? { lateFeePerSubject: body.lateFeePerSubject }
          : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      select: { id: true, name: true, status: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Another series of this school's already has those details.", 409);
    }
    console.error("[API] PATCH /api/v2/schools/exams/series/[id] error:", error);
    return errorResponse("Failed to correct the series");
  }
}
