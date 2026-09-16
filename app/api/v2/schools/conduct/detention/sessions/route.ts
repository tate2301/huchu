import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { DetentionError, createSession, detentionSessions } from "@/lib/schools/detention";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Detention sessions — the filter at the top of the register, and
 * `The coming sessions` at the bottom of it.
 *
 * A session with no supervisor comes back rather than being refused at
 * creation. `Not yet supervised`, in red, against a date a fortnight out is a
 * real state a school needs to see — and it is the second thing on that screen
 * somebody can act on today.
 */

const listQuery = z.object({
  termId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  roomId: z.string().uuid().nullish(),
  supervisorTeacherProfileId: z.string().uuid().nullish(),
  label: z.string().trim().max(80).nullish(),
  termId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = listQuery.parse(Object.fromEntries(searchParams.entries()));
    const companyId = session.user.companyId;
    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;

    const rows = await detentionSessions({
      companyId,
      termId: termId ?? undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
    });
    return successResponse({ rows, termId: termId ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/conduct/detention/sessions error:", error);
    return errorResponse("Failed to read the sessions");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "create");
    if (denied) return errorResponse(denied, 403);

    const body = createSchema.parse(await request.json());
    const companyId = session.user.companyId;
    const termId = body.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse("The school has no term running to schedule this in.", 400);
    }
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt) {
      return errorResponse("A session has to end after it starts.", 422);
    }

    const created = await createSession({
      companyId,
      termId,
      startsAt,
      endsAt,
      roomId: body.roomId ?? null,
      supervisorTeacherProfileId: body.supervisorTeacherProfileId ?? null,
      label: body.label ?? null,
    });
    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof DetentionError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/detention/sessions error:", error);
    return errorResponse("Failed to schedule the session");
  }
}
