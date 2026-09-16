import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  LeaverError,
  goneStillOwing,
  leaverQueue,
  leaverTallies,
  recordLeaver,
} from "@/lib/schools/leavers";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * The leaving queue.
 *
 * `Gone, still owing` comes back with it rather than as a filter, because the
 * two are different states of mind: the queue is work in progress, and a closed
 * record with money outstanding is a debt somebody has to decide whether to
 * chase. A school that hid the second inside the first would find it again a
 * year later.
 */

const listQuery = z.object({
  status: z.enum(["open", "closed"]).optional(),
  reason: z
    .enum([
      "COMPLETED_FORM_4",
      "COMPLETED_UPPER_6",
      "FEES",
      "TRANSFERRED_TO_ANOTHER_SCHOOL",
      "MOVED_ABROAD",
      "EXPELLED",
      "WITHDRAWN_BY_GUARDIAN",
      "OTHER",
    ])
    .optional(),
  level: z.coerce.number().int().min(1).max(13).optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  clearance: z.enum(["cleared", "not-cleared"]).optional(),
  search: z.string().trim().max(120).optional(),
});

const createSchema = z.object({
  studentId: z.string().uuid(),
  lastDay: z.string().datetime(),
  reason: z.enum([
    "COMPLETED_FORM_4",
    "COMPLETED_UPPER_6",
    "FEES",
    "TRANSFERRED_TO_ANOTHER_SCHOOL",
    "MOVED_ABROAD",
    "EXPELLED",
    "WITHDRAWN_BY_GUARDIAN",
    "OTHER",
  ]),
  reasonNote: z.string().trim().max(300).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.leavers", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = listQuery.parse(Object.fromEntries(searchParams.entries()));
    const companyId = session.user.companyId;

    const [rows, tallies, owing] = await Promise.all([
      leaverQueue({ companyId, ...query, status: query.status ?? "open" }),
      leaverTallies({ companyId }),
      goneStillOwing({ companyId }),
    ]);
    return successResponse({ rows, tallies, goneStillOwing: owing });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/leavers error:", error);
    return errorResponse("Failed to read the leaving queue");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.leavers", "create");
    if (denied) return errorResponse(denied, 403);

    const body = createSchema.parse(await request.json());
    const leaver = await recordLeaver({
      companyId: session.user.companyId,
      actorId: session.user.id,
      studentId: body.studentId,
      lastDay: new Date(body.lastDay),
      reason: body.reason,
      reasonNote: body.reasonNote ?? null,
    });
    return successResponse(leaver, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LeaverError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/leavers error:", error);
    return errorResponse("Failed to record the leaver");
  }
}
