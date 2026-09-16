import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  NEVER_DESTINATIONS,
  PastoralError,
  grantClearance,
  readerRegister,
  revokeClearance,
} from "@/lib/schools/pastoral";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * `Who may read a pastoral note`.
 *
 * It comes before the notes on the screen, and that is the composition decision
 * the whole page turns on: the reader is told who can see this before they are
 * shown anything to see.
 *
 * The four never-destinations are returned as data because they are data — the
 * parent portal, the report card, a leaving certificate or testimonial, and any
 * export, spreadsheet or print. They are filed in the same table as the people
 * because the rule is the same kind of fact, and each of them is a code path
 * that must not exist rather than a reader with zero permissions.
 */

const grantSchema = z.object({
  userId: z.string().uuid(),
  bands: z
    .array(
      z.enum([
        "PASTORAL_TEAM_ONLY",
        "HEAD_AND_PASTORAL_TEAM",
        "SAFEGUARDING_NAMED_INDIVIDUALS",
      ]),
    )
    .min(1),
  scope: z.enum(["SCHOOL", "YEAR_GROUP", "CLASS"]),
  scopeLevel: z.coerce.number().int().min(1).max(13).nullish(),
  scopeClassId: z.string().uuid().nullish(),
});

const revokeSchema = z.object({ userId: z.string().uuid(), revoke: z.literal(true) });

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.pastoral", "view");
    if (denied) return errorResponse(denied, 403);

    const register = await readerRegister({
      companyId: session.user.companyId,
      viewerUserId: session.user.id,
    });
    return successResponse({ ...register, never: NEVER_DESTINATIONS });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/conduct/pastoral/readers error:", error);
    return errorResponse("Failed to read the register");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Granting a clearance is the head's act, not the pastoral team's: it
    // decides who else reads notes about children.
    const denied = schoolPermissionDenial(session, "schools.pastoral", "archive");
    if (denied) {
      return errorResponse("Only the head can change who may read a pastoral note.", 403);
    }

    const payload = await request.json();
    const revoking = revokeSchema.safeParse(payload);
    if (revoking.success) {
      const result = await revokeClearance({
        companyId: session.user.companyId,
        actorId: session.user.id,
        userId: revoking.data.userId,
      });
      return successResponse(result);
    }

    const body = grantSchema.parse(payload);
    const clearance = await grantClearance({
      companyId: session.user.companyId,
      actorId: session.user.id,
      userId: body.userId,
      bands: body.bands,
      scope: body.scope,
      scopeLevel: body.scopeLevel ?? null,
      scopeClassId: body.scopeClassId ?? null,
    });
    return successResponse(clearance, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof PastoralError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/pastoral/readers error:", error);
    return errorResponse("Failed to change the clearance");
  }
}
