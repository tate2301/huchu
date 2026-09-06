import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { applyYearRollUp, planYearRollUp } from "@corelithzw/module-campus/year-rollup";

const querySchema = z.object({
  fromTermId: z.string().uuid(),
  toTermId: z.string().uuid(),
  classId: z.string().uuid().optional(),
});

const applySchema = z.object({
  fromTermId: z.string().uuid(),
  toTermId: z.string().uuid(),
  decisions: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        action: z.enum(["PROMOTE", "REPEAT", "GRADUATE", "TRANSFER", "WITHDRAW"]),
        toClassId: z.string().uuid().nullish(),
        toStreamId: z.string().uuid().nullish(),
      }),
    )
    .min(1)
    .max(2000),
});

/** What the roll-up would do, without doing it. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      fromTermId: searchParams.get("fromTermId") ?? undefined,
      toTermId: searchParams.get("toTermId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
    });

    const plan = await planYearRollUp({
      companyId: session.user.companyId,
      ...query,
    });
    return successResponse(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Error && /not found|same one/i.test(error.message)) {
      return errorResponse(error.message, 400);
    }
    console.error("[API] GET /api/v2/schools/year-rollup error:", error);
    return errorResponse("Failed to work the roll-up out");
  }
}

/**
 * Do it.
 *
 * `archive`, the strongest grant the students resource has, because this is the
 * one action in the pack that changes every child's record at once. The two
 * steps — plan, then apply with explicit decisions — mean the server never
 * infers what to do: whatever comes back is what somebody read and agreed to.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "archive");
    if (denied) return errorResponse(denied, 403);

    const validated = applySchema.parse(await request.json());
    const result = await applyYearRollUp({
      companyId: session.user.companyId,
      fromTermId: validated.fromTermId,
      toTermId: validated.toTermId,
      decisions: validated.decisions,
      actorUserId: session.user.id,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/year-rollup error:", error);
    return errorResponse("Failed to roll the school up");
  }
}
