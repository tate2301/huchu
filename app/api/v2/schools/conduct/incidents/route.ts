import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { ConductError, conductTallies, listIncidents, logIncident } from "@/lib/schools/conduct";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * The behaviour log.
 *
 * `schools.conduct`, not `schools.students`: a behaviour record is not a class
 * list, and everybody who can read the roll should not be handed the log. It is
 * not `schools.welfare` either — a pastoral note and a sanction are different
 * records with different readers, which is the distinction the whole page is
 * drawn around.
 */

const listQuery = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  level: z.coerce.number().int().min(1).max(13).optional(),
  categoryId: z.string().uuid().optional(),
  sanction: z.enum(["decided", "undecided"]).optional(),
  home: z.enum(["told", "not-told", "not-needed"]).optional(),
  studentId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const createSchema = z.object({
  studentId: z.string().uuid(),
  categoryId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  summary: z.string().trim().min(1).max(500),
  location: z.string().trim().max(200).nullish(),
  period: z.coerce.number().int().min(1).max(20).nullish(),
  sanction: z.string().trim().max(200).nullish(),
  sanctionTone: z.enum(["PLAIN", "WARN", "BAD"]).optional(),
  homeToldNeeded: z.boolean().optional(),
  termId: z.string().uuid().optional(),
  participants: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        sanction: z.string().trim().max(200).nullish(),
      }),
    )
    .max(20)
    .optional(),
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
    // The log is a term's log. Without a term the band chips have nothing to
    // count and the table is every incident the school has ever recorded, which
    // is not a screen anybody asked for.
    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return successResponse({
        rows: [],
        tallies: { thisTerm: 0, noSanctionDecided: 0, homeNotTold: 0, threeOrMore: 0 },
        termId: null,
      });
    }

    const [rows, tallies] = await Promise.all([
      listIncidents({ ...query, companyId, termId }),
      conductTallies({ companyId, termId }),
    ]);
    return successResponse({ rows, tallies, termId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/conduct/incidents error:", error);
    return errorResponse("Failed to read the behaviour log");
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
      return errorResponse(
        "The school has no term running, so there is nothing to log this against.",
        400,
      );
    }

    const incident = await logIncident({
      companyId,
      actorId: session.user.id,
      termId,
      studentId: body.studentId,
      categoryId: body.categoryId,
      occurredAt: new Date(body.occurredAt),
      summary: body.summary,
      location: body.location ?? null,
      period: body.period ?? null,
      sanction: body.sanction ?? null,
      sanctionTone: body.sanctionTone,
      homeToldNeeded: body.homeToldNeeded,
      participants: body.participants,
    });
    return successResponse(incident, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ConductError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/incidents error:", error);
    return errorResponse("Failed to log the incident");
  }
}
