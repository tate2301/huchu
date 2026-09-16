import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { MeritError, awardMeritEntry, meritLedger, meritTallies } from "@/lib/schools/merits";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * The merit ledger, by pupil.
 *
 * `award` rather than `create`: a teacher should be able to give a point and
 * not to log an incident, and the two are different acts with different
 * consequences. Reversing one needs `edit`, which a teacher does not hold —
 * taking a point back after it has been read out at assembly is the office's
 * decision.
 *
 * `POST` writes either kind. The artboard draws only `Award a merit`, which
 * `conduct.md` open question 4 flags as an omission rather than an intent: half
 * the table, half the chips and half the arithmetic are demerits and no verb
 * created one.
 */

const listQuery = z.object({
  termId: z.string().uuid().optional(),
  level: z.coerce.number().int().min(1).max(13).optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(["net-desc", "net-asc", "merits-desc", "demerits-desc", "name"]).optional(),
  limit: z.coerce.number().int().min(1).max(600).optional(),
});

const awardSchema = z.object({
  studentId: z.string().uuid(),
  reasonId: z.string().uuid(),
  kind: z.enum(["MERIT", "DEMERIT"]),
  points: z.coerce.number().int().min(1).max(100).optional(),
  note: z.string().trim().max(500).nullish(),
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
    if (!termId) {
      return successResponse({
        rows: [],
        tallies: { merits: 0, demerits: 0, net: 0, pupilsWithNeither: 0 },
        termId: null,
      });
    }

    const [rows, tallies] = await Promise.all([
      meritLedger({ ...query, companyId, termId }),
      meritTallies({ companyId, termId }),
    ]);
    return successResponse({ rows, tallies, termId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/conduct/merits error:", error);
    return errorResponse("Failed to read the ledger");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "award");
    if (denied) return errorResponse(denied, 403);

    const body = awardSchema.parse(await request.json());
    const companyId = session.user.companyId;
    const termId = body.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse("The school has no term running, so nothing can be awarded.", 400);
    }

    const entry = await awardMeritEntry({
      companyId,
      actorId: session.user.id,
      termId,
      studentId: body.studentId,
      reasonId: body.reasonId,
      kind: body.kind,
      points: body.points,
      note: body.note ?? null,
    });
    return successResponse(entry, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MeritError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/merits error:", error);
    return errorResponse("Failed to record it");
  }
}
