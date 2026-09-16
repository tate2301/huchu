import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { assignSeats, ExamError, seatingPlan } from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Seating and invigilation, one session at a time.
 *
 * The session is the unit rather than the paper, because a school seats a room
 * for a sitting: two papers at nine o'clock on Tuesday are one hall, one set of
 * desks and one invigilator.
 *
 * `Sitting two papers at once` is the one thing on the screen that cannot be
 * fixed by moving a chair, so it is computed here — an overlapping session in
 * the same series that shares a candidate — and reported as a clash rather than
 * as a seating problem.
 */

const listQuery = z.object({ sessionId: z.string().uuid().optional() });

const postSchema = z.union([
  z.object({ sessionId: z.string().uuid(), assign: z.literal(true), candidateIds: z.array(z.string().uuid()).optional() }),
  z.object({
    sessionId: z.string().uuid(),
    roomId: z.string().uuid(),
    purpose: z.string().trim().max(80).nullish(),
    capacity: z.coerce.number().int().min(1).max(2000).nullish(),
    invigilatorTeacherProfileId: z.string().uuid().nullish(),
    invigilatorName: z.string().trim().max(160).nullish(),
  }),
]);

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
    const { searchParams } = new URL(request.url);
    const query = listQuery.parse(Object.fromEntries(searchParams.entries()));
    const companyId = session.user.companyId;

    const sessions = await prisma.schoolExamSession.findMany({
      where: { companyId, seriesId },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        label: true,
        paper: {
          select: { code: true, examSubject: { select: { name: true } } },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    const sessionId = query.sessionId ?? sessions[0]?.id;
    if (!sessionId) return successResponse({ sessions, plan: null });

    const plan = await seatingPlan({ companyId, sessionId });
    return successResponse({ sessions, plan });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/exams/series/[id]/seating error:", error);
    return errorResponse("Failed to read the seating plan");
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "edit");
    if (denied) return errorResponse(denied, 403);

    await context.params;
    const body = postSchema.parse(await request.json());
    const companyId = session.user.companyId;

    if ("assign" in body) {
      const result = await assignSeats({
        companyId,
        sessionId: body.sessionId,
        candidateIds: body.candidateIds,
      });
      return successResponse(result, 201);
    }

    const allocation = await prisma.schoolExamRoomAllocation.upsert({
      where: { sessionId_roomId: { sessionId: body.sessionId, roomId: body.roomId } },
      create: {
        companyId,
        sessionId: body.sessionId,
        roomId: body.roomId,
        purpose: body.purpose ?? null,
        capacity: body.capacity ?? null,
        invigilatorTeacherProfileId: body.invigilatorTeacherProfileId ?? null,
        invigilatorName: body.invigilatorName ?? null,
      },
      update: {
        purpose: body.purpose ?? null,
        capacity: body.capacity ?? null,
        invigilatorTeacherProfileId: body.invigilatorTeacherProfileId ?? null,
        invigilatorName: body.invigilatorName ?? null,
      },
      select: { id: true },
    });
    return successResponse(allocation, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/exams/series/[id]/seating error:", error);
    return errorResponse("Failed to change the seating");
  }
}
